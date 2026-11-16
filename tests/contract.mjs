import assert from 'node:assert/strict'
import fs from 'node:fs'
import ganache from 'ganache'
import { BrowserProvider, ContractFactory, ZeroAddress } from 'ethers'

const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 11155111, hardfork: 'shanghai' }, wallet: { totalAccounts: 6 } })
const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 })
provider.pollingInterval = 10
const signers = await Promise.all(Array.from({ length: 6 }, (_, i) => provider.getSigner(i)))
const [admin, doctor, patient, otherDoctor, otherPatient, outsider] = signers
const [a, d, p, d2, p2] = await Promise.all(signers.slice(0, 5).map(s => s.getAddress()))
const artifact = JSON.parse(fs.readFileSync(new URL('../artifacts/MedicalRecordSystem.json', import.meta.url)))
const c = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, admin).deploy()
await c.waitForDeployment()
const tx = async promise => (await promise).wait()
let checks = 0
async function denied(promise) { await assert.rejects(promise); checks++ }
function check(actual, expected) { assert.equal(actual, expected); checks++ }
try {
  check(await c.schemaVersion(), 2n)
  check(await c.roles(a), 1n)
  await denied(c.connect(doctor).assignRole(p, 3))
  await denied(c.assignRole(a, 0))
  await denied(c.assignRole(ZeroAddress, 3))
  await denied(c.assignRole(d, 1))
  await tx(c.assignRole(d, 2)); await tx(c.assignRole(p, 3))
  await tx(c.assignRole(d2, 2)); await tx(c.assignRole(p2, 3))
  const data = { patientName: 'Pasien Fiktif', birthDate: '2000-03-14', gender: 'Laki-laki', bloodType: 'O+',
    heightCmX10: 1705, weightKgX10: 652, medicalHistory: 'Asma', allergies: 'Alergi obat contoh', complaint: 'Batuk',
    diagnosis: 'Diagnosis simulasi', medications: 'Obat contoh', notes: 'Catatan tes, bukan data medis asli' }
  await denied(c.connect(doctor).addRecord(p, data))
  await denied(c.connect(doctor).setDoctorAuthorization(d2, true))
  await tx(c.connect(patient).setDoctorAuthorization(d, true))
  await tx(c.connect(patient).setDoctorAuthorization(d2, true))
  await tx(c.connect(doctor).addRecord(p, data))
  check(await c.connect(patient).getRecordCount(p), 1n)
  const rows = await c.connect(patient).getRecordsPage(p, 0, 10)
  check(rows[0].data.heightCmX10, 1705n)
  check(rows[0].data.weightKgX10, 652n)
  check(rows[0].doctor.toLowerCase(), d.toLowerCase())
  check(rows[0].data.patientName, data.patientName)
  await denied(c.getRecordCount(p)) // admin has no clinical read role
  await denied(c.connect(otherPatient).getRecordCount(p))
  await denied(c.connect(outsider).getRecordsPage(p, 0, 10))
  await denied(c.connect(doctor).addRecord(p, { ...data, patientName: '' }))
  await denied(c.connect(doctor).addRecord(p, { ...data, diagnosis: '' }))
  await denied(c.connect(doctor).addRecord(p, { ...data, heightCmX10: 3001 }))
  await denied(c.connect(doctor).addRecord(p, { ...data, weightKgX10: 7001 }))
  await denied(c.connect(doctor).addRecord(p, { ...data, notes: 'é'.repeat(1001) }))
  await denied(c.connect(otherDoctor).updateRecord(p, 0, data))
  await denied(c.connect(otherDoctor).deleteRecord(p, 0))
  await tx(c.connect(doctor).updateRecord(p, 0, { ...data, diagnosis: 'Revisi', weightKgX10: 661 }))
  check((await c.connect(patient).getRecordsPage(p, 0, 10))[0].data.diagnosis, 'Revisi')
  await tx(c.connect(patient).setDoctorAuthorization(d, false))
  await denied(c.connect(doctor).getRecordsPage(p, 0, 10))
  await denied(c.connect(doctor).updateRecord(p, 0, data))
  await tx(c.connect(patient).setDoctorAuthorization(d, true))
  await tx(c.connect(doctor).deleteRecord(p, 0))
  check((await c.connect(patient).getRecordsPage(p, 0, 10))[0].isActive, false)
  await denied(c.connect(doctor).updateRecord(p, 0, data))
  await denied(c.connect(doctor).deleteRecord(p, 0))
  await denied(c.connect(doctor).deleteRecord(p, 99))
  await denied(c.connect(patient).addRecord(p, data))
  for (let i = 1; i < 12; i++) await tx(c.connect(doctor).addRecord(p, { ...data, diagnosis: `Record ${i}` }))
  check(await c.connect(patient).getRecordCount(p), 12n)
  check((await c.connect(patient).getRecordsPage(p, 0, 10)).length, 10)
  check((await c.connect(patient).getRecordsPage(p, 10, 10)).length, 2)
  check((await c.connect(patient).getRecordsPage(p, 12, 10)).length, 0)
  await denied(c.connect(patient).getRecordsPage(p, 0, 0))
  await denied(c.connect(patient).getRecordsPage(p, 0, 21))
  await tx(c.assignRole(d, 0)); await tx(c.assignRole(d, 2))
  check(await c.authorizedDoctors(p, d), false)
  await tx(c.connect(patient).setDoctorAuthorization(d, true))
  check(await c.authorizedDoctors(p, d), true)
  await tx(c.assignRole(p, 0)); await tx(c.assignRole(p, 3))
  check(await c.authorizedDoctors(p, d), false)
  check(await c.authorizedDoctors(p, d2), false)
  console.log(`PASS: ${checks} contract checks. CRUD, privacy gates, author-only edits, bounds, pagination, and role-change consent invalidation.`)
} finally { await rpc.disconnect() }
