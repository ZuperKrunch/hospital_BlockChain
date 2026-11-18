import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { abi } from '../server/contract.json'
import { request } from './hybrid-api'
import { Brand, Empty, Feedback, Icon, Pill } from './ui'
import { roles, short, W } from './format'
import { useAction, useLoad } from './hooks'
import { Dashboard, Directory, Profiles, Permissions, RoleManagement } from './pages-people'
import { Appointments, Billing, Emergency, Records } from './pages-care'
import './App.css'

const routes = [
  ['home', 'Ringkasan', 'grid', Dashboard, [1, 2, 3]],
  ['appointments', 'Appointment', 'calendar', Appointments, [1, 2, 3]],
  ['records', 'Rekam Medis', 'file', Records, [2, 3]],
  ['directory', 'Direktori Dokter', 'people', Directory, [1, 2, 3]],
  ['permissions', 'Izin Dokter', 'shield', Permissions, [3]],
  ['billing', 'Kasir & Pembayaran', 'wallet', Billing, [1, 3]],
  ['emergency', 'Akses Darurat', 'cross', Emergency, [1, 2, 3]],
  ['roles', 'Pengguna & Peran', 'people', RoleManagement, [1]],
  ['profile', 'Profil Saya', 'user', Profiles, [1, 2, 3]],
]
const getRoute = () => window.location.hash.slice(1).split('/')[0] || 'home'
const terminalKey = 'ruangsehat-terminal-v3'
const sessionKey = 'ruangsehat-session-v3'
const demoSessionKey = sessionKey + ':demo'
const walletSessionKey = (config, wallet) => [sessionKey, config.chainId, config.contract.toLowerCase(), wallet.toLowerCase()].join(':')
const stored = key => { try { return window.sessionStorage.getItem(key) || '' } catch { return '' } }
function storeToken(key, token) {
  if (token) window.sessionStorage.setItem(key, token)
  else window.sessionStorage.removeItem(key)
}

function Login({ config, onConnect, loading, error, action, retry }) {
  return <main className="login-scene">
    <section className="login-feature">
      <Brand />
      <div className="login-content">
        <p className="eyebrow">Hospital management</p>
        <h1>Ruang kerja<br />layanan kesehatan.</h1>
        <p>Kelola kunjungan dan rekam medis dengan akses sesuai peran Anda.</p>
      </div>
      <div className="login-art" aria-hidden="true"><Icon name="cross" /></div>
      <small>RuangSehat Workspace</small>
    </section>
    <section className="login-card">
      <p className="eyebrow">Workspace</p>
      <h2>Selamat datang</h2>
      <p>{config?.demo ? 'Pilih akun fiktif untuk mencoba alur aplikasi.' : 'Hubungkan MetaMask untuk masuk ke sistem rumah sakit.'}</p>
      <Feedback error={error || action.error} />
      {loading ? <p role="status">Menghubungkan ke layanan…</p> : config?.demo ? (
        <div className="persona-list">{config.personas.map(persona => <button type="button" className="persona" key={persona.wallet} disabled={action.busy}
          onClick={() => onConnect(persona.wallet)}><span className="avatar">{persona.name.slice(0, 1)}</span>
          <span><strong>{persona.name}</strong><small>{persona.role}</small></span><Icon name="arrow" /></button>)}</div>
      ) : config ? <button type="button" disabled={action.busy} onClick={() => onConnect()}><Icon name="wallet" />
        {action.busy ? 'Menunggu MetaMask…' : 'Masuk dengan MetaMask'}</button> : <button type="button" onClick={retry}>Coba lagi</button>}
      <small className="muted">Gunakan data fiktif dalam demo. Jadwal ditampilkan dalam WIB.</small>
    </section>
  </main>
}

export default function App() {
  const config = useLoad(signal => request('/config', { signal }))
  const settings = config.data
  const [session, setSession] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const activeRestore = useRef(null)
  const { token, me } = session ?? {}
  const [route, setRoute] = useState(getRoute)
  const [terminal, setTerminal] = useState(() => window.localStorage.getItem(terminalKey) || '')
  const [visit, setVisit] = useState('')
  const action = useAction()
  function setDevice(value) {
    setTerminal(value)
    if (value) window.localStorage.setItem(terminalKey, value)
    else window.localStorage.removeItem(terminalKey)
  }
  function api(path, options) { return request(path, { token, terminal, ...options }) }
  const navigate = useCallback(next => { window.location.hash = next; setRoute(next); window.scrollTo({ top: 0 }) }, [])
  async function refresh() {
    const result = await api('/me')
    setSession(current => current?.token === token ? { ...current, me: result } : current)
    return result
  }
  useEffect(() => {
    const handler = () => setRoute(getRoute())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  const restoreSession = useCallback(async () => {
    if (!settings) return
    activeRestore.current?.abort()
    const controller = new AbortController()
    activeRestore.current = controller
    const { signal } = controller
    setSession(null)
    setVisit('')
    setSessionError('')
    setRestoring(true)
    let key = demoSessionKey
    let savedToken = ''
    try {
      let wallet
      if (!settings.demo) {
        const ethereum = window.ethereum
        if (!ethereum) return
        const [chain, accounts] = await Promise.all([
          ethereum.request({ method: 'eth_chainId' }),
          ethereum.request({ method: 'eth_accounts' }),
        ])
        if (signal.aborted || chain !== '0x' + settings.chainId.toString(16) || !accounts[0]) return
        wallet = accounts[0].toLowerCase()
        key = walletSessionKey(settings, wallet)
      }
      savedToken = stored(key)
      const legacyToken = !savedToken && stored(sessionKey)
      if (!savedToken && !legacyToken) return
      const profile = await request('/me', { token: savedToken || legacyToken, signal })
      if (signal.aborted) return
      if (wallet && profile.wallet.toLowerCase() !== wallet) {
        if (savedToken) storeToken(key, '')
        return
      }
      if (legacyToken) {
        storeToken(key, legacyToken)
        storeToken(sessionKey, '')
      }
      setSession({ key, token: savedToken || legacyToken, me: profile })
    } catch (error) {
      if (signal.aborted) return
      if (error.status === 401) storeToken(savedToken ? key : sessionKey, '')
      else setSessionError(error.message)
    } finally {
      if (!signal.aborted) setRestoring(false)
    }
  }, [settings])

  useEffect(() => {
    if (!settings) return
    const ethereum = settings.demo ? null : window.ethereum
    const restoreOnChange = () => {
      navigate('home')
      void restoreSession()
    }
    ethereum?.on?.('accountsChanged', restoreOnChange)
    ethereum?.on?.('chainChanged', restoreOnChange)
    let listening = true
    queueMicrotask(() => { if (listening) void restoreSession() })
    return () => {
      listening = false
      activeRestore.current?.abort()
      ethereum?.removeListener?.('accountsChanged', restoreOnChange)
      ethereum?.removeListener?.('chainChanged', restoreOnChange)
    }
  }, [settings, restoreSession, navigate])

  async function connect(demoWallet) {
    const result = await action.run(async () => {
      if (settings.demo) {
        const result = await request('/auth/demo', { method: 'POST', body: { wallet: demoWallet } })
        return { key: demoSessionKey, token: result.token }
      }
      if (!window.ethereum) throw new Error('Ekstensi MetaMask belum terdeteksi.')
      const chainId = '0x' + settings.chainId.toString(16)
      if (await window.ethereum.request({ method: 'eth_chainId' }) !== chainId) {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
      }
      const [wallet] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (!wallet) throw new Error('Wallet belum dihubungkan.')
      const key = walletSessionKey(settings, wallet)
      const saved = stored(key)
      if (saved) {
        try {
          const profile = await request('/me', { token: saved })
          if (profile.wallet.toLowerCase() === wallet.toLowerCase()) return { key, token: saved }
        } catch (error) {
          if (error.status !== 401) throw error
        }
        storeToken(key, '')
      }
      const signer = await new BrowserProvider(window.ethereum).getSigner(wallet)
      const challenge = await request('/auth/challenge', { method: 'POST', body: { wallet } })
      const signature = await signer.signMessage(challenge.message)
      const result = await request('/auth/verify', { method: 'POST', body: { nonce: challenge.nonce, signature } })
      return { key, token: result.token }
    })
    if (result) {
      storeToken(result.key, result.token)
      navigate('home')
      await restoreSession()
    }
  }
  async function writeChain(method, args, demoEndpoint, body) {
    if (config.data.demo) return api(demoEndpoint, { method: 'POST', body })
    const provider = new BrowserProvider(window.ethereum)
    if ((await provider.getNetwork()).chainId !== BigInt(config.data.chainId)) throw new Error('Pilih jaringan Ethereum Sepolia.')
    const signer = await provider.getSigner()
    if ((await signer.getAddress()).toLowerCase() !== me.wallet) throw new Error('Wallet aktif berubah. Masuk lagi.')
    const contract = new Contract(config.data.contract, abi, signer)
    return (await contract[method](...args)).wait()
  }
  async function signOut() {
    activeRestore.current?.abort()
    storeToken(session.key, '')
    setSession(null)
    setRestoring(false)
    setVisit('')
    await request('/auth/logout', { token, method: 'POST' }).catch(() => {})
  }
  if (!token || !me || !config.data) return <Login config={config.data} onConnect={connect}
    loading={config.loading || restoring} action={action} error={config.error || sessionError} retry={config.reload} />

  const allowed = routes.filter(item => item[4].includes(me.role))
  const current = allowed.find(item => item[0] === route) ?? allowed[0]
  const Page = current?.[3]
  const displayName = me.profile?.name || roles[me.role]
  return <div className="shell">
    <aside className="sidebar">
      <Brand />
      <p className="workspace-label">Hospital workspace</p>
      <nav aria-label="Menu utama">{allowed.map(([id, title, icon]) =>
        <a key={id} href={'#' + id} aria-current={current?.[0] === id ? 'page' : undefined}
          onClick={e => {e.preventDefault(); navigate(id)}}>
          <Icon name={icon} /><span>{id === 'records' && me.role === W.patient ? 'Rekam Medis Saya' : title}</span>
        </a>)}</nav>
      <div className="sidebar-note"><Icon name="shield" /><div><strong>Akses sesuai peran</strong><small>RuangSehat Workspace</small></div></div>
    </aside>
    <div className="work">
      <header className="topbar">
        <div className="breadcrumb">Workspace <span>/</span> <strong>{current?.[1] || 'Akun'}</strong></div>
        <div className="top-actions"><Pill tone={config.data.demo ? 'blue' : 'mint'}>{config.data.demo ? 'Demo lokal' : 'Sepolia'}</Pill>
          <div className="identity"><span className="avatar">{displayName.slice(0, 1)}</span><div><strong>{displayName}</strong><small>{roles[me.role]} · {short(me.wallet)}</small></div></div>
          <button type="button" className="icon-button" aria-label="Keluar" title="Keluar" onClick={signOut}><Icon name="logout" /></button>
        </div>
      </header>
      <main className="workspace" key={me.wallet + ':' + (current?.[0] || 'none')}>
        {Page ? <Page {...{ api, me, navigate, writeChain, refresh, terminal, setDevice, visit, setVisit }} /> :
          <Empty title="Wallet belum terdaftar">Minta admin menetapkan peran untuk wallet {short(me.wallet)} lalu masuk ulang.</Empty>}
      </main>
      <footer className="site-footer">RuangSehat <span>Hospital dApp · WIB</span></footer>
    </div>
  </div>
}
