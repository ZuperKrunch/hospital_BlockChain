import { useState } from 'react'
import {
  BrowserProvider,
  Contract,
  getAddress,
  isAddress,
  ZeroAddress,
} from 'ethers'

import contractAbi from './MedicalRecordSystem.json'

export default function AdminDashboard({ contractAddress, account }) {
  const [targetAddress, setTargetAddress] = useState('')
  const [selectedRole, setSelectedRole] = useState('2')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function assignRole(event) {
    event.preventDefault()
    setMessage('')
    setError('')

    const input = targetAddress.trim()

    if (!isAddress(input) || input.toLowerCase() === ZeroAddress) {
      setError('Masukkan alamat wallet yang valid.')
      return
    }

    const target = getAddress(input)

    if (target.toLowerCase() === account.toLowerCase()) {
      setError('Role akun admin tidak bisa diubah.')
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

      const currentRole = await contract.roles(target)

      if (Number(currentRole) === Number(selectedRole)) {
        throw new Error('Akun tersebut sudah memiliki role yang dipilih.')
      }

      setMessage('Konfirmasi transaksi di MetaMask.')

      const transaction = await contract.assignRole(
        target,
        Number(selectedRole)
      )

      setMessage('Transaksi dikirim. Menunggu konfirmasi blockchain...')

      await transaction.wait()

      const names = {
        0: 'Belum terdaftar',
        2: 'Dokter',
        3: 'Pasien',
      }

      setMessage(
        `Berhasil! Role ${target} menjadi ${names[selectedRole]}.`
      )
    } catch (err) {
      setMessage('')

      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setError('Transaksi dibatalkan di MetaMask.')
      } else {
        setError(err.reason || err.shortMessage || err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Dashboard Admin</h2>
      <p>Daftarkan dokter, pasien, atau cabut role pengguna.</p>

      <form onSubmit={assignRole} className="role-form">
        <label htmlFor="target-wallet">Alamat wallet pengguna</label>
        <input
          id="target-wallet"
          type="text"
          placeholder="0x..."
          value={targetAddress}
          onChange={(event) => setTargetAddress(event.target.value)}
          disabled={busy}
          required
        />

        <label htmlFor="target-role">Role</label>
        <select
          id="target-role"
          value={selectedRole}
          onChange={(event) => setSelectedRole(event.target.value)}
          disabled={busy}
        >
          <option value="2">Dokter</option>
          <option value="3">Pasien</option>
          <option value="0">Cabut role</option>
        </select>

        <button type="submit" disabled={busy}>
          {busy ? 'Memproses...' : 'Simpan Role'}
        </button>
      </form>

      {message && (
        <p role="status" className="address">{message}</p>
      )}

      {error && <p role="alert" className="error">{error}</p>}
    </section>
  )
}