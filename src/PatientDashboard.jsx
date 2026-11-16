import { useState } from 'react'
import {
  BrowserProvider,
  Contract,
  isAddress,
  ZeroAddress,
} from 'ethers'

import contractAbi from './MedicalRecordSystem.json'
import PatientRecords from './PatientRecords'

export default function PatientDashboard({ contractAddress, account }) {
  const [doctorAddress, setDoctorAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function manageAuthorization(action) {
    setMessage('')
    setError('')

    const doctor = doctorAddress.trim()

    if (!isAddress(doctor) || doctor.toLowerCase() === ZeroAddress) {
      setError('Masukkan alamat wallet dokter yang valid.')
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

      const authorized = await contract.authorizedDoctors(
        account,
        doctor
      )

      if (action === 'check') {
        const doctorRole = await contract.roles(doctor)
        const isDoctor = Number(doctorRole) === 2

        if (!isDoctor) {
          setMessage(
            'Akun ini bukan dokter aktif. Akses dokter tidak berlaku.'
          )
        } else {
          setMessage(
            authorized
              ? 'Dokter ini sudah diizinkan mengakses record lu.'
              : 'Dokter ini belum diizinkan mengakses record lu.'
          )
        }

        return
      }

      const status = action === 'grant'

      if (status) {
        const doctorRole = await contract.roles(doctor)

        if (Number(doctorRole) !== 2) {
          throw new Error('Alamat tersebut belum terdaftar sebagai dokter.')
        }
      }

      if (authorized === status) {
        throw new Error(
          status
            ? 'Dokter ini sudah memiliki izin.'
            : 'Dokter ini tidak memiliki izin yang perlu dicabut.'
        )
      }

      setMessage('Konfirmasi transaksi di MetaMask.')

      const transaction = await contract.setDoctorAuthorization(
        doctor,
        status
      )

      setMessage('Menunggu konfirmasi blockchain...')

      await transaction.wait()

      setMessage(
        status
          ? 'Berhasil memberikan izin ke dokter.'
          : 'Berhasil mencabut izin dokter.'
      )
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
      <h2>Dashboard Pasien</h2>
      <p>
        Kelola dokter yang boleh membaca dan menambahkan rekam medis.
        Edit dan hapus tetap terbatas pada dokter pembuat catatan.
      </p>

      <div className="role-form">
        <label htmlFor="doctor-wallet">Alamat wallet dokter</label>

        <input
          id="doctor-wallet"
          type="text"
          placeholder="0x..."
          value={doctorAddress}
          onChange={(event) => {
            setDoctorAddress(event.target.value)
            setMessage('')
            setError('')
          }}
          disabled={busy}
        />

        <button
          type="button"
          onClick={() => manageAuthorization('check')}
          disabled={busy}
        >
          Cek Izin
        </button>

        <button
          type="button"
          onClick={() => manageAuthorization('grant')}
          disabled={busy}
        >
          Berikan Izin
        </button>

        <button
          type="button"
          onClick={() => manageAuthorization('revoke')}
          disabled={busy}
        >
          Cabut Izin
        </button>
      </div>

      {busy && <p>Memproses permintaan...</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <PatientRecords key={account} contractAddress={contractAddress} account={account} />
    </section>
  )
}