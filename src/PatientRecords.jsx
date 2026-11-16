import { useRef, useState } from 'react'
import RecordsTable from './RecordsTable'
import { errorMessage, signedContract } from './medical'
import { readRecordPage } from './recordPage'

export default function PatientRecords({ contractAddress, account }) {
  const [listing, setListing] = useState({ records: null, total: 0, page: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function load(page = 0) {
    if (lock.current) return
    lock.current = true
    setBusy(true); setError('')
    // Hide the previous snapshot while refreshing or on a failed access check.
    setListing({ records: null, total: 0, page: 0 })
    try {
      const contract = await signedContract(contractAddress, account)
      setListing(await readRecordPage(contract, account, page))
    } catch (err) { setError(errorMessage(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="patient-records">
    <h3>Rekam Medis Saya</h3>
    <p>Lihat pemeriksaan yang dokter catat untuk wallet Anda. Data pasien dan pengukuran mengikuti masing-masing pemeriksaan.</p>
    <button type="button" disabled={busy} onClick={() => load()}>{busy ? 'Memuat...' : 'Lihat / Refresh Record Saya'}</button>
    {error && <p className="error" role="alert">{error}</p>}
    <RecordsTable key={account} {...listing} patient={account} account={account} busy={busy} onPage={load} editingId={null} />
  </section>
}
