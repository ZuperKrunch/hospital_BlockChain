import { useRef, useState } from 'react'
import MedicalForm from './MedicalForm'
import RecordsTable from './RecordsTable'
import { EMPTY_MEDICAL, errorMessage, recordToForm, signedContract, toMedicalData, validWallet } from './medical'
import { readRecordPage } from './recordPage'

export default function DoctorDashboard({ contractAddress, account }) {
  const [patientAddress, setPatientAddress] = useState('')
  const [newForm, setNewForm] = useState({ ...EMPTY_MEDICAL })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_MEDICAL })
  const [listing, setListing] = useState({ records: null, total: 0, page: 0 })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const lock = useRef(false)

  async function handleAction(action, recordId = null, targetPage = listing.page) {
    if (lock.current) return
    setError('')
    setMessage('')
    const patient = patientAddress.trim()
    if (!validWallet(patient)) { setError('Masukkan alamat wallet pasien yang valid.'); return }
    let data
    try {
      if (action === 'add' || action === 'update') data = toMedicalData(action === 'add' ? newForm : editForm)
    } catch (err) { setError(errorMessage(err)); return }
    lock.current = true
    setBusy(true)
    try {
      const contract = await signedContract(contractAddress, account)
      if (Number(await contract.roles(patient)) !== 3) throw new Error('Alamat tersebut belum terdaftar sebagai pasien.')
      if (!await contract.authorizedDoctors(patient, account)) throw new Error('Pasien belum memberikan izin ke dokter ini.')
      if (action === 'view') {
        setListing(await readRecordPage(contract, patient, targetPage))
        return
      }
      if (!['add', 'update', 'delete'].includes(action)) throw new Error('Aksi tidak dikenal.')
      setMessage('Konfirmasi transaksi di MetaMask.')
      const tx = action === 'add' ? await contract.addRecord(patient, data)
        : action === 'update' ? await contract.updateRecord(patient, recordId, data)
          : await contract.deleteRecord(patient, recordId)
      setMessage('Menunggu konfirmasi blockchain...')
      await tx.wait()
      if (action === 'add') setNewForm({ ...EMPTY_MEDICAL })
      setEditingId(null)
      setEditForm({ ...EMPTY_MEDICAL })
      const labels = { add: 'Record berhasil ditambahkan.', update: 'Record berhasil diperbarui.', delete: 'Record berhasil dinonaktifkan.' }
      setMessage(labels[action])
      // Do not mistake a read failure after a confirmed write for a failed transaction.
      setListing({ records: null, total: 0, page: 0 })
      try { setListing(await readRecordPage(contract, patient, action === 'add' ? 0 : targetPage)) }
      catch (err) { setError(`Transaksi sudah berhasil, tetapi daftar belum termuat. Klik Lihat / Refresh Record. ${errorMessage(err)}`) }
    } catch (err) {
      setMessage('')
      setError(errorMessage(err))
      if (action === 'view') setListing({ records: null, total: 0, page: 0 })
    } finally { lock.current = false; setBusy(false) }
  }

  return <section>
    <h2>Dashboard Dokter</h2>
    <p>Isi pemeriksaan pasien yang sudah memberikan izin. Edit dan delete hanya tersedia untuk dokter pembuat record.</p>
    <div className="role-form patient-picker">
      <label htmlFor="patient-wallet">Alamat wallet pasien</label>
      <input id="patient-wallet" placeholder="0x..." value={patientAddress} disabled={busy || editingId !== null} onChange={e => {
        setPatientAddress(e.target.value)
        setNewForm({ ...EMPTY_MEDICAL })
        setEditForm({ ...EMPTY_MEDICAL })
        setListing({ records: null, total: 0, page: 0 })
        setMessage(''); setError('')
      }} />
      <button type="button" disabled={busy || editingId !== null} onClick={() => handleAction('view', null, 0)}>Lihat / Refresh Record</button>
    </div>
    <details className="add-section" open={editingId === null ? undefined : false}>
      <summary>Tambah pemeriksaan baru</summary>
      <p className="address">Pasien tujuan: {patientAddress.trim() || 'Isi alamat wallet pasien di atas.'}</p>
      {editingId !== null && <p>Selesaikan atau batalkan edit sebelum menambah record.</p>}
      <MedicalForm value={newForm} onChange={setNewForm} disabled={busy || editingId !== null}
        prefix="new" submitLabel="Tambah Record ke Blockchain" onSubmit={e => { e.preventDefault(); handleAction('add') }} />
    </details>
    {busy && <p role="status">Memproses permintaan...</p>}
    {message && <p role="status" className="success-message">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <RecordsTable key={patientAddress.trim().toLowerCase()} {...listing} account={account} patient={patientAddress.trim()} busy={busy}
      onPage={page => handleAction('view', null, page)} editingId={editingId} editForm={editForm} setEditForm={setEditForm}
      onEdit={r => { setEditingId(r.id); setEditForm(recordToForm(r)); setMessage(''); setError('') }}
      onCancel={() => { setEditingId(null); setEditForm({ ...EMPTY_MEDICAL }); setError('') }}
      onSave={e => { e.preventDefault(); handleAction('update', editingId) }}
      onDelete={id => { if (window.confirm(`Nonaktifkan Record #${id}? Riwayat blockchain tetap ada.`)) handleAction('delete', id) }} />
  </section>
}
