import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BrowserProvider, Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, getAddress } from 'ethers'
import { createApi } from './api.mjs'
import { openStore } from './store.mjs'

const artifact = JSON.parse(readFileSync(new URL('./contract.json', import.meta.url), 'utf8'))
const demoMode = process.argv.includes('--demo')
if (!demoMode && existsSync('.env')) process.loadEnvFile('.env')
const env = process.env
const origin = new URL(demoMode ? 'http://localhost:5173' : env.APP_ORIGIN || 'http://localhost:5173').origin
const chainId = demoMode ? 31337 : 11155111
const dir = resolve('data/demo')
const store = openStore(demoMode ? resolve(dir, 'ruangsehat.sqlite') : resolve(env.DATABASE_PATH || 'data/ruangsehat.sqlite'))
let rpc, provider, contract, publisher, demo
const wait = async transaction => (await transaction).wait(1, 18_000)

if (demoMode) {
  const { default: ganache } = await import('ganache')
  mkdirSync(dir, { recursive: true })
  rpc = ganache.provider({
    logging: { quiet: true }, chain: { chainId },
    wallet: { deterministic: true, totalAccounts: 5 }, database: { dbPath: resolve(dir, 'evm') },
  })
  provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1, pollingInterval: 250 })
  const wallets = await Promise.all([0, 1, 2, 3, 4].map(index => provider.getSigner(index)))
  const [admin, doctor, patient, secondDoctor, signer] = wallets
  publisher = signer
  const addressFile = resolve(dir, 'contract-address')
  const priorAddress = existsSync(addressFile) ? readFileSync(addressFile, 'utf8').trim() : ''
  const needsDeploy = !priorAddress || await provider.getCode(priorAddress) === '0x'
  contract = needsDeploy ? await new ContractFactory(artifact.abi, artifact.bytecode, admin).deploy()
    : new Contract(priorAddress, artifact.abi, admin)
  await contract.waitForDeployment()
  const personas = [
    { name: 'Nadia', role: 'Admin', wallet: admin.address.toLowerCase() },
    { name: 'dr. Arga', role: 'Dokter', wallet: doctor.address.toLowerCase() },
    { name: 'Alex', role: 'Pasien', wallet: patient.address.toLowerCase() },
    { name: 'dr. Maya', role: 'Dokter', wallet: secondDoctor.address.toLowerCase() },
  ]
  if (needsDeploy) {
    await wait(contract.setPublisher(publisher.address))
    for (const [index, role] of [[1, 2], [2, 3], [3, 2]]) await wait(contract.assignRole(wallets[index].address, role))
    await wait(contract.connect(patient).setDoctorAuthorization(doctor.address, true))
    writeFileSync(addressFile, await contract.getAddress())
  }
  if (!store.get('SELECT wallet FROM profiles LIMIT 1')) {
    store.run('INSERT INTO profiles(wallet,name) VALUES (?,?)', personas[0].wallet, 'Nadia')
    store.run('INSERT INTO profiles(wallet,name,specialty,clinic,bio) VALUES (?,?,?,?,?)', personas[1].wallet, 'dr. Arga', 'Penyakit Dalam', 'Poli Internis', 'Konsultasi dan tindak lanjut kondisi kronis.')
    store.run('INSERT INTO profiles(wallet,name,specialty,clinic,bio) VALUES (?,?,?,?,?)', personas[3].wallet, 'dr. Maya', 'Dokter Umum', 'Poli Umum', 'Pemeriksaan umum dan tindak lanjut pasien.')
    store.run('INSERT INTO profiles(wallet,name,gender) VALUES (?,?,?)', personas[2].wallet, 'Alex', 'Laki-laki')
    const timestamp = Date.now()
    store.run('INSERT INTO appointments(id,patient,doctor,starts,ends,status) VALUES (?,?,?,?,?,?)',
      '11111111-2222-4333-8444-555555555555', personas[2].wallet, personas[1].wallet, timestamp - 10 * 60_000, timestamp + 110 * 60_000, 'checked_in')
  }
  demo = {
    personas,
    assignRole: async (wallet, role) => wait(contract.assignRole(wallet, role)),
    permission: async (wallet, doctorWallet, enabled) => wait(
      contract.connect(wallets.find(item => item.address.toLowerCase() === wallet)).setDoctorAuthorization(doctorWallet, enabled),
    ),
  }
} else {
  if (!env.RPC_URL || !env.CONTRACT_ADDRESS || !env.PUBLISHER_PRIVATE_KEY) {
    throw new Error('Isi RPC_URL, CONTRACT_ADDRESS dan PUBLISHER_PRIVATE_KEY di .env. Untuk lokal tanpa wallet, jalankan npm run demo.')
  }
  const request = new FetchRequest(env.RPC_URL)
  request.timeout = 12_000
  provider = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 })
  if ((await provider.getNetwork()).chainId !== BigInt(chainId)) throw new Error('RPC_URL harus mengarah ke Ethereum Sepolia.')
  publisher = new Wallet(env.PUBLISHER_PRIVATE_KEY, provider)
  contract = new Contract(getAddress(env.CONTRACT_ADDRESS), artifact.abi, provider)
  if ((await contract.publisher()).toLowerCase() !== publisher.address.toLowerCase()) throw new Error('Admin perlu mendaftarkan alamat publisher lewat setPublisher().')
}

const chain = {
  contract: await contract.getAddress(), chainId,
  roles: wallet => contract.roles(wallet),
  authorizedDoctors: (patient, doctor) => contract.authorizedDoctors(patient, doctor),
  proofAt: (id, version) => contract.proofAt(id, version),
  proofCount: id => contract.proofCount(id),
  transactionStatus: async txHash => {
    const receipt = await provider.getTransactionReceipt(txHash)
    return receipt ? (receipt.status === 1 ? 'confirmed' : 'failed') : 'pending'
  },
  publish: async (id, version, hash, active, onSubmit) => {
    const tx = await contract.connect(publisher).publishProof(id, version, hash, active)
    onSubmit(tx.hash)
    await wait(tx)
  },
}
const server = createServer({ requestTimeout: 25_000, headersTimeout: 10_000 }, createApi({ store, chain, origin, demo }))
const port = Number(demoMode ? 3001 : env.PORT || 3001)
const host = demoMode ? '127.0.0.1' : env.HOST || '127.0.0.1'
server.listen(port, host, () => console.log(`RuangSehat API · ${demoMode ? 'demo lokal' : 'Sepolia'} · http://${host}:${port}`))
async function stop() {
  server.close()
  store.close()
  if (rpc) await rpc.disconnect()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
