import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ganache from 'ganache'
import { BrowserProvider, ContractFactory, Wallet } from 'ethers'
import { createApi } from '../server/api.mjs'
import { openStore } from '../server/store.mjs'

const origin = 'http://localhost:5173'
const epoch = Date.UTC(2026, 10, 18, 1)
const minute = 60_000

test('RuangSehat hybrid access and persistent records', async t => {
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337 }, wallet: { deterministic: true, totalAccounts: 6 } })
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1, pollingInterval: 50 })
  const accounts = Object.entries(rpc.getInitialAccounts())
  const [admin, doctor, patient, other, visitor] = accounts.map(([address]) => address)
  const signers = await Promise.all([0,1,2,3,4,5].map(index => provider.getSigner(index)))
  const publisher = signers[5]
  const artifact = JSON.parse(readFileSync(new URL('../server/contract.json', import.meta.url), 'utf8'))
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signers[0]).deploy()
  await contract.waitForDeployment()
  const wait = async tx => (await tx).wait()
  await wait(contract.setPublisher(publisher.address))
  for (const [wallet, role] of [[doctor,2],[patient,3],[other,2],[visitor,3]]) await wait(contract.assignRole(wallet,role))
  await wait(contract.connect(signers[2]).setDoctorAuthorization(doctor,true))
  const dir = mkdtempSync(join(tmpdir(), 'ruangsehat-'))
  const databasePath = join(dir, 'records.sqlite')
  const store = openStore(databasePath)
  let time = epoch
  let sent
  let pending = false
  const chain = {
    contract: await contract.getAddress(), chainId: 31337,
    roles: wallet => contract.roles(wallet),
    authorizedDoctors: (owner, reader) => contract.authorizedDoctors(owner, reader),
    proofCount: id => contract.proofCount(id), proofAt: (id, version) => contract.proofAt(id, version),
    transactionStatus: async txHash => (await provider.getTransactionReceipt(txHash)) ? 'confirmed' : 'pending',
    publish: async (id, version, proof, active, onSubmit) => {
      if (pending) throw new Error('RPC temporary failure')
      const tx = await contract.connect(publisher).publishProof(id, version, proof, active)
      onSubmit(tx.hash)
      sent = tx
      await tx.wait()
    },
  }
  const server = createServer(createApi({store,chain,origin,clock:() => time}))
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async () => { server.close(); await once(server,'close'); store.close(); await rpc.disconnect(); rmSync(dir,{recursive:true,force:true}) })
  const base = 'http://127.0.0.1:' + server.address().port
  const call = async (path, { key, method = 'GET', body, terminal, from = origin } = {}) => {
    const response = await fetch(base+'/api'+path,{method,headers:{Origin:from,
      ...(body !== undefined ? {'Content-Type':'application/json'} : {}),
      ...(key ? {Authorization:'Bearer '+key} : {}), ...(terminal ? {'X-Terminal-Token':terminal} : {})},
      body:body === undefined ? undefined : JSON.stringify(body)})
    return { status:response.status, data:await response.json() }
  }
  async function login(index) {
    const [wallet,{secretKey}] = accounts[index]
    const { data, status } = await call('/auth/challenge',{method:'POST',body:{wallet}})
    assert.equal(status,200)
    const signature=await new Wallet(secretKey).signMessage(data.message)
    const verified=await call('/auth/verify',{method:'POST',body:{nonce:data.nonce,signature}})
    assert.equal(verified.status,200)
    assert.equal((await call('/auth/verify',{method:'POST',body:{nonce:data.nonce,signature}})).status,401)
    return verified.data.token
  }
  const [a,d,p,o,v] = await Promise.all([0,1,2,3,4].map(login))
  const put = (key, path, body) => call(path,{method:'PUT', key, body})
  const post = (key, path, body, terminal) => call(path,{method:'POST',key,body,terminal})
  const get = (key, path, terminal) => call(path,{key,terminal})
  assert.equal((await call('/auth/demo',{method:'POST',body:{wallet:admin}})).status,404)
  assert.equal((await call('/auth/challenge',{method:'POST',body:{wallet:admin},from:'https://example.test'})).status,403)
  assert.equal((await get('', '/records')).status,401)
  const mismatch = (await post('', '/auth/challenge',{wallet:doctor})).data
  assert.equal((await post('', '/auth/verify',{nonce:mismatch.nonce,signature:await new Wallet(accounts[0][1].secretKey).signMessage(mismatch.message)})).status,401)

  assert.equal((await put(d,'/profiles/me',{name:'dr. Demo',specialty:'Umum',clinic:'Poli A'})).status,200)
  assert.equal((await put(p,'/profiles/me',{name:'Pasien Fiktif',phone:'0800000000'})).status,200)
  assert.equal((await get(p,'/doctors')).data[0].clinic,'Poli A')
  assert.equal((await put(d,'/profiles/me',{wallet:patient,name:'dr. Demo',specialty:'Umum',clinic:'Poli B'})).data.wallet,doctor)
  assert.equal((await get(p,'/me')).data.profile.name,'Pasien Fiktif')
  assert.equal((await get(d,'/users')).status,403)
  assert.equal((await call('/profiles/me',{method:'DELETE',key:d})).status,200)
  assert.deepEqual((await get(p,'/doctors')).data,[])

  const window = {patient,doctor,starts:epoch+minute,ends:epoch+121*minute}
  assert.equal((await post(d,'/appointments',window)).status,403)
  const created=await post(a,'/appointments',window)
  assert.equal(created.status,200)
  const id=created.data.id
  assert.equal((await post(a,'/appointments',window)).status,409)
  assert.deepEqual((await get(v,'/appointments')).data,[])
  const patch = action => call('/appointments/'+id,{method:'PATCH',key:a,body:{action}})
  assert.equal((await patch('check_in')).status,200)
  const read = key => get(key,'/records?appointment='+id)
  assert.equal((await read(d)).status,403)
  time=window.starts
  assert.equal((await read(d)).status,200)
  assert.equal((await read(o)).status,403)
  assert.equal((await read(a)).status,403)
  const input={appointment:id, complaint:'Keluhan fiktif',diagnosis:'Diagnosis contoh pribadi',medications:'Contoh',expected_version:0}
  pending=true
  const waiting=await post(d,'/records',input)
  assert.equal(waiting.status,202)
  assert.deepEqual((await read(p)).data,[])
  assert.equal((await post(d,'/records',input)).status,409)
  pending=false
  assert.equal((await post(d,'/records',{appointment:id,action:'sync'})).status,200)
  const recordId=waiting.data.id
  assert.equal(await contract.proofCount(recordId),1n)
  assert.deepEqual([...contract.interface.parseTransaction({ data: sent.data }).args],
    [recordId,1n,waiting.data.commitment,true])
  assert.equal((await read(p)).data[0].versions[0].body.diagnosis,input.diagnosis)
  assert.deepEqual((await read(v)).data,[])
  assert.equal((await post(d,'/records',{...input,expected_version:1,reason:'Revisi',diagnosis:'Catatan revisi'})).status,200)
  assert.equal((await read(p)).data[0].versions.length,2)
  await assert.rejects(() => contract.connect(signers[1]).publishProof(recordId,3,'0x'+'11'.repeat(32),true))

  const earlier='a0000000-0000-4000-8000-000000000001'
  store.run('INSERT INTO appointments(id,patient,doctor,starts,ends,status) VALUES (?,?,?,?,?,?)',earlier,patient,other,epoch-150*minute,epoch-90*minute,'completed')
  store.run('INSERT INTO records(id,appointment,patient,doctor) VALUES (?,?,?,?)','0x'+'14'.repeat(32),earlier,patient,other)
  store.run('INSERT INTO versions(record,version,body,salt,commitment,active,created,confirmed) VALUES (?,?,?,?,?,?,?,?)','0x'+'14'.repeat(32),1,'{}','salt','proof',1,epoch-90*minute,1)
  assert.equal((await read(d)).data.length,2)
  time=window.ends
  assert.equal((await read(d)).data.length,1)
  assert.equal((await post(d,'/records',{...input,expected_version:2,reason:'Catatan akhir'})).status,200)
  await wait(contract.connect(signers[2]).setDoctorAuthorization(doctor,false))
  assert.equal((await read(d)).status,403)
  await wait(contract.connect(signers[2]).setDoctorAuthorization(doctor,true))
  time=window.ends+30*minute
  assert.equal((await read(d)).status,403)
  assert.equal((await post(d,'/records',{...input,expected_version:3,reason:'Lewat batas'})).status,403)
  assert.equal((await read(p)).data.find(row => row.id===recordId).versions.length,3)

  const unpaid={appointment:id,amount:80000,description:'Biaya konsultasi',status:'unpaid'}
  assert.equal((await put(a,'/bills',unpaid)).status,200)
  const billId=(await get(p,'/bills')).data[0].id
  const removeBill = (key, itemId) => call('/bills/'+itemId,{method:'DELETE',key})
  assert.equal((await put(a,'/bills',{...unpaid,id:billId,amount:90000})).status,200)
  assert.equal((await get(p,'/bills')).data[0].amount,90000)
  assert.equal((await removeBill(p,billId)).status,403)
  assert.equal((await removeBill(a,billId)).status,200)
  assert.deepEqual((await get(p,'/bills')).data,[])
  assert.equal((await put(a,'/bills',{...unpaid,id:billId})).status,409)
  const bill={...unpaid,amount:90000,status:'paid'}
  assert.equal((await put(a,'/bills',bill)).status,200)
  assert.equal((await get(p,'/bills')).data[0].amount,90000)
  assert.equal((await removeBill(a,(await get(p,'/bills')).data[0].id)).status,409)
  assert.deepEqual((await get(v,'/bills')).data,[])
  assert.equal((await get(d,'/bills')).status,403)
  assert.equal((await put(a,'/bills',{...bill,amount:12})).status,409)
  assert.equal((await post(d,'/emergencies',{patient,reason:'Lainnya'})).status,403)
  const device=(await post(a,'/terminal',{name:'IGD Demo'})).data.token
  const emergency=await post(d,'/emergencies',{patient,reason:'Lainnya'},device)
  assert.equal(emergency.status,200)
  const emergencyPath='/emergencies/'+emergency.data.id
  assert.equal((await get(d,emergencyPath+'/summary')).status,403)
  const summary=await get(d,emergencyPath+'/summary',device)
  assert.equal(summary.status,200)
  assert.equal(summary.data.diagnosis,undefined)
  assert.equal(summary.data.medications,'Contoh')
  assert.equal((await get(o,emergencyPath+'/summary',device)).status,403)
  assert.equal((await get(p,'/emergencies')).data.length,1)
  assert.deepEqual((await get(v,'/emergencies')).data,[])
  assert.equal((await post(d,emergencyPath+'/report',{report:'Terlalu awal'})).status,409)
  assert.equal((await post(d,emergencyPath+'/close')).status,200)
  assert.equal((await get(d,emergencyPath+'/summary',device)).status,403)
  assert.equal((await post(d,emergencyPath+'/report',{report:'Keterangan kegiatan demo'})).status,200)

  const followup=(await post(a,'/appointments',{patient,doctor,starts:time,ends:time+60*minute})).data.id
  assert.ok(followup)
  assert.equal((await call('/appointments/'+followup,{method:'PATCH',key:a,body:{action:'check_in'}})).status,200)
  const proof=await post(d,'/records',{...input,appointment:followup})
  assert.equal(proof.status,200)
  const deactivated=await post(d,'/records',{appointment:followup,action:'deactivate',expected_version:1,reason:'Koreksi administrasi'})
  assert.equal(deactivated.status,200)
  assert.equal(await contract.proofCount(proof.data.id),2n)
  assert.equal((await contract.proofAt(proof.data.id,2)).active,false)
  const deactivatedRecord=(await read(p)).data.find(row => row.id===proof.data.id)
  assert.equal(deactivatedRecord.versions[0].active,false)
  assert.equal(deactivatedRecord.versions[1].body.diagnosis,input.diagnosis)

  const persisted=openStore(databasePath)
  assert.equal(persisted.get('SELECT COUNT(*) AS count FROM bills').count,1)
  assert.equal(persisted.get('SELECT COUNT(*) AS count FROM versions WHERE record=?',recordId).count,3)
  persisted.close()
})
