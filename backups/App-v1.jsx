import { useEffect, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import contractAbi from './MedicalRecordSystem.json'
import AdminDashboard from './AdminDashboard'
import PatientDashboard from './PatientDashboard'
import DoctorDashboard from './DoctorDashboard'
import './App.css'

const CONTRACT_ADDRESS =
  '0x5398cb90222a180e041C404010ca92373dEaF558'.toLowerCase()

const ROLE_NAMES = ['Belum terdaftar', 'Admin', 'Dokter', 'Pasien']

export default function App() {
  const [account, setAccount] = useState('')
  const [role, setRole] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [loadingRole, setLoadingRole] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const wallet = window.ethereum
    if (!wallet) return

    function handleAccountsChanged(accounts) {
      setAccount(accounts[0] ?? '')
      setRole(null)
      setError('')
    }

    function handleChainChanged() {
      window.location.reload()
    }

    wallet.request({ method: 'eth_accounts' })
      .then(handleAccountsChanged)
      .catch(() => setError('Gagal membaca koneksi wallet.'))

    wallet.on('accountsChanged', handleAccountsChanged)
    wallet.on('chainChanged', handleChainChanged)

    return () => {
      wallet.removeListener('accountsChanged', handleAccountsChanged)
      wallet.removeListener('chainChanged', handleChainChanged)
    }
  }, [])

  useEffect(() => {
    if (!account || !window.ethereum) return

    // Abaikan hasil permintaan lama jika akun berubah.
    let cancelled = false

    async function loadRole() {
      setLoadingRole(true)
      setRole(null)
      setError('')

      try {
        const provider = new BrowserProvider(window.ethereum)
        const network = await provider.getNetwork()

        if (network.chainId !== 11155111n) {
          throw new Error(
            'Ganti jaringan MetaMask ke Ethereum Sepolia.'
          )
        }

        const code = await provider.getCode(CONTRACT_ADDRESS)

        if (code === '0x') {
          throw new Error(
            'Kontrak tidak ditemukan di alamat ini pada Sepolia.'
          )
        }

        const contract = new Contract(
          CONTRACT_ADDRESS,
          contractAbi,
          provider
        )

        const userRole = await contract.roles(account)

        if (!cancelled) {
          setRole(Number(userRole))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.shortMessage || err.message)
        }
      } finally {
        if (!cancelled) {
          setLoadingRole(false)
        }
      }
    }

    loadRole()

    return () => {
      cancelled = true
    }
  }, [account])

  async function connectWallet() {
    if (!window.ethereum) {
      setError('MetaMask tidak terdeteksi di browser ini.')
      return
    }

    setConnecting(true)
    setError('')

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      setAccount(accounts[0] ?? '')
    } catch (err) {
      if (err.code === 4001) {
        setError('Permintaan koneksi ditolak.')
      } else if (err.code === -32002) {
        setError('Selesaikan permintaan yang tertunda di MetaMask.')
      } else {
        setError(err.message || 'Gagal menghubungkan wallet.')
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <main className="card">
      <p className="label">HOSPITAL DAPP</p>
      <h1>Medical Record System</h1>

      {!account ? (
        <>
          <p>Hubungkan wallet untuk mulai menggunakan aplikasi.</p>
          <button onClick={connectWallet} disabled={connecting}>
            {connecting ? 'Menghubungkan...' : 'Connect Wallet'}
          </button>
        </>
      ) : (
        <section className="wallet-info">
          <strong>Wallet terhubung</strong>
          <p className="address">{account}</p>

          {loadingRole && <p>Membaca role dari blockchain...</p>}

          {role !== null && (
            <>
              <p>
                Role: <strong>{ROLE_NAMES[role] ?? 'Tidak dikenal'}</strong>
              </p>

              {role === 0 && (
                <p>Minta admin mendaftarkan alamat wallet ini.</p>
              )}

              {role === 1 && (
                <AdminDashboard
                  key={account}
                  contractAddress={CONTRACT_ADDRESS}
                  account={account}
                />
              )}
              {role === 2 && (
                <DoctorDashboard
                  key={account}
                  contractAddress={CONTRACT_ADDRESS}
                  account={account}
                />
              )}
              {role === 3 && (
                <PatientDashboard
                  key={account}
                  contractAddress={CONTRACT_ADDRESS}
                  account={account}
                />
              )}
            </>
          )}
        </section>
      )}

      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}