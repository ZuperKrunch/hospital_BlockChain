import { BrowserProvider, Contract, isAddress, ZeroAddress } from 'ethers'
import abi from './MedicalRecordSystem.json'

export const EMPTY_MEDICAL = {
  patientName: '', birthDate: '', gender: '', bloodType: '', height: '', weight: '',
  medicalHistory: '', allergies: '', complaint: '', diagnosis: '', medications: '', notes: '',
}
export const TEXT_FIELDS = [
  ['medicalHistory', 'Riwayat penyakit', 1000],
  ['allergies', 'Alergi', 1000],
  ['complaint', 'Keluhan', 1000],
  ['diagnosis', 'Diagnosis', 1000],
  ['medications', 'Obat / terapi', 1000],
  ['notes', 'Catatan dokter', 2000],
]
export function validWallet(value) {
  return isAddress(value) && value.toLowerCase() !== ZeroAddress
}
export function errorMessage(err) {
  if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err.info?.error?.code === 4001) {
    return 'Permintaan dibatalkan di MetaMask.'
  }
  return err.reason || err.shortMessage || err.message || 'Permintaan gagal.'
}
export async function signedContract(contractAddress, account) {
  if (!window.ethereum) throw new Error('MetaMask tidak terdeteksi.')
  if (!validWallet(contractAddress)) throw new Error('Isi VITE_CONTRACT_ADDRESS dengan alamat kontrak v2.')
  const provider = new BrowserProvider(window.ethereum, undefined, { cacheTimeout: -1 })
  if ((await provider.getNetwork()).chainId !== 11155111n) throw new Error('Gunakan jaringan Ethereum Sepolia.')
  const signer = await provider.getSigner()
  if ((await signer.getAddress()).toLowerCase() !== account.toLowerCase()) {
    throw new Error('Akun wallet berubah. Hubungkan kembali akun yang benar.')
  }
  return new Contract(contractAddress, abi, signer)
}
export function toMedicalData(form) {
  const patientName = form.patientName.trim()
  const diagnosis = form.diagnosis.trim()
  if (!patientName || !diagnosis) throw new Error('Nama pasien dan diagnosis wajib diisi.')
  for (const [key, label, limit] of [['patientName', 'Nama pasien', 120], ...TEXT_FIELDS]) {
    if (new TextEncoder().encode(form[key].trim()).length > limit) throw new Error(`${label} melebihi batas ${limit} byte UTF-8.`)
  }
  function scaled(value, max, label) {
    if (value === '') return 0
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0 || n > max || Math.abs(n * 10 - Math.round(n * 10)) > 1e-7) {
      throw new Error(`${label}: isi lebih dari 0 sampai ${max}, maksimal 1 angka desimal, atau kosongkan.`)
    }
    return Math.round(n * 10)
  }
  if (form.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate) || form.birthDate > localToday())) {
    throw new Error('Tanggal lahir tidak valid atau berada di masa depan.')
  }
  return {
    patientName, birthDate: form.birthDate, gender: form.gender, bloodType: form.bloodType,
    heightCmX10: scaled(form.height, 300, 'Tinggi badan'),
    weightKgX10: scaled(form.weight, 700, 'Berat badan'),
    ...Object.fromEntries(TEXT_FIELDS.map(([key]) => [key, form[key].trim()])),
  }
}
export function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function recordToForm(record) {
  const d = record.data
  return {
    ...Object.fromEntries(['patientName', 'birthDate', 'gender', 'bloodType', ...TEXT_FIELDS.map(([k]) => k)].map(k => [k, d[k]])),
    height: Number(d.heightCmX10) ? String(Number(d.heightCmX10) / 10) : '',
    weight: Number(d.weightKgX10) ? String(Number(d.weightKgX10) / 10) : '',
  }
}
export function displayMeasure(value, unit) {
  return Number(value) ? `${Number(value) / 10} ${unit}` : 'Belum diukur'
}
export function formatDate(value) {
  return new Date(Number(value) * 1000).toLocaleString('id-ID')
}
export const shortWallet = value => `${value.slice(0, 6)}…${value.slice(-4)}`
