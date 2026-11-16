import { useState } from 'react'
import { BrowserProvider, Contract, isAddress, ZeroAddress } from 'ethers'
import contractAbi from './MedicalRecordSystem.json'

export default function DoctorDashboard({ contractAddress, account }) {
  const [patientAddress, setPatientAddress] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editHash, setEditHash] = useState('')
  const [ipfsHash, setIpfsHash] = useState('')
  const [records, setRecords] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleAction(action, recordId = null) {
    setMessage('')
    setError('')

    const patient = patientAddress.trim()
    const hash = action === 'update' ? editHash.trim() : ipfsHash.trim()

    if (!isAddress(patient) || patient.toLowerCase() === ZeroAddress) {
      setError('Masukkan alamat pasien yang valid.')
      return
    }

    if ((action === 'add' || action === 'update') && !hash) {
      setError('Isi referensi dokumen terlebih dahulu.')
      return
    }

    setBusy(true)

    try {
      const provider = new BrowserProvider(window.ethereum)
      const network = await provider.getNetwork()

      if (network.chainId !== 11155111n) {
        throw new Error('Gunakan jaringan Ethereum Sepolia.')
      }

      const signer = await provider.getSigner()
      const signerAddress = await signer.getAddress()

      if (signerAddress.toLowerCase() !== account.toLowerCase()) {
        throw new Error('Akun wallet berubah. Refresh halaman dulu.')
      }

      const contract = new Contract(
        contractAddress,
        contractAbi,
        signer
      )

      if (Number(await contract.roles(patient)) !== 3) {
        throw new Error('Alamat tersebut belum terdaftar sebagai pasien.')
      }

      const authorized = await contract.authorizedDoctors(
        patient,
        account
      )

      if (!authorized) {
        throw new Error('Pasien belum memberikan izin ke dokter ini.')
      }

      if (action === 'view') {
        const result = await contract.getRecords(patient)

        const items = result.map((record, index) => ({
          id: index,
          ipfsHash: record.ipfsHash,
          createdAt: Number(record.createdAt),
          updatedAt: Number(record.updatedAt),
          doctor: record.doctor,
          isActive: record.isActive,
        }))

        setRecords(items)
      } else {
        setMessage('Konfirmasi transaksi di MetaMask.')

        let transaction

        if (action === 'add') {
          transaction = await contract.addRecord(patient, hash)
        } else if (action === 'update') {
          transaction = await contract.updateRecord(
            patient,
            recordId,
            hash
          )
        } else if (action === 'delete') {
          transaction = await contract.deleteRecord(patient, recordId)
        } else {
          throw new Error('Aksi tidak dikenal.')
        }

        setMessage('Menunggu konfirmasi blockchain...')
        await transaction.wait()

        if (action === 'add') {
          setIpfsHash('')
        }

        if (action === 'update' || action === 'delete') {
          setEditingId(null)
          setEditHash('')
        }

        const messages = {
          add: 'Record berhasil ditambahkan.',
          update: 'Record berhasil diperbarui.',
          delete: 'Record berhasil dinonaktifkan.',
        }

        setMessage(
          `${messages[action]} Klik Lihat Record untuk memperbarui daftar.`
        )
      }
    } catch (err) {
      setMessage('')

      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setError('Permintaan dibatalkan di MetaMask.')
      } else {
        setError(err.reason || err.shortMessage || err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Dashboard Dokter</h2>

      <div className="role-form">
        <label htmlFor="patient-wallet">Alamat wallet pasien</label>

        <input
          id="patient-wallet"
          placeholder="0x..."
          value={patientAddress}
          onChange={(event) => {
            setPatientAddress(event.target.value)
            setRecords(null)
            setEditingId(null)
            setEditHash('')
            setMessage('')
            setError('')
          }}
          disabled={busy}
        />

        <button
          type="button"
          onClick={() => handleAction('view')}
          disabled={busy}
        >
          Lihat Record
        </button>

        <label htmlFor="record-hash">
          Referensi dokumen / CID IPFS untuk record baru
        </label>

        <input
          id="record-hash"
          placeholder="Untuk tes: demo-record-v1"
          value={ipfsHash}
          onChange={(event) => setIpfsHash(event.target.value)}
          disabled={busy || editingId !== null}
        />

        <button
          type="button"
          onClick={() => handleAction('add')}
          disabled={busy || editingId !== null}
        >
          Tambah Record
        </button>
      </div>

      {busy && <p>Memproses permintaan...</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {records !== null && (
        <section>
          <h3>Rekam Medis Pasien</h3>
          <p className="address">Wallet pasien: {patientAddress.trim()}</p>

          {records.length === 0 && <p>Belum ada record.</p>}

          {records.map((record) => (
            <article key={record.id} className="record-item">
              <strong>Record #{record.id}</strong>

              <p>Status: {record.isActive ? 'Aktif' : 'Deleted'}</p>

              <p className="address">
                Referensi: {record.ipfsHash}
              </p>

              <p className="address">
                Dokter pembuat: {record.doctor}
              </p>

              <p>
                Dibuat:{' '}
                {new Date(record.createdAt * 1000).toLocaleString('id-ID')}
              </p>

              <p>
                Diubah:{' '}
                {new Date(record.updatedAt * 1000).toLocaleString('id-ID')}
              </p>

              {record.isActive &&
                record.doctor.toLowerCase() === account.toLowerCase() && (
                  <>
                    {editingId === record.id ? (
                      <div className="role-form edit-form">
                        <label htmlFor={`edit-record-${record.id}`}>
                          Edit referensi Record #{record.id}
                        </label>

                        <input
                          id={`edit-record-${record.id}`}
                          value={editHash}
                          onChange={(event) => setEditHash(event.target.value)}
                          disabled={busy}
                        />

                        <div className="record-actions">
                          <button
                            type="button"
                            disabled={busy || !editHash.trim()}
                            onClick={() => handleAction('update', record.id)}
                          >
                            Simpan Perubahan
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(null)
                              setEditHash('')
                            }}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="record-actions">
                        <button
                          type="button"
                          disabled={busy || editingId !== null}
                          onClick={() => {
                            setEditingId(record.id)
                            setEditHash(record.ipfsHash)
                            setMessage('')
                            setError('')
                          }}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="danger-button"
                          disabled={busy || editingId !== null}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Nonaktifkan Record #${record.id}?`
                              )
                            ) {
                              handleAction('delete', record.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
            </article>
          ))}
        </section>
      )}
    </section>
  )
}