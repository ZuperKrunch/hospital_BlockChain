import { useState } from 'react'
import { Empty, Feedback, Field, Icon, Panel, Pill, VisitStatus } from './ui'
import { fmt, short, W } from './format'
import { useAction, useLoad } from './hooks'

export function Dashboard({ api, me, navigate }) {
  const visits = useLoad(signal => api('/appointments', { signal }))
  const list = visits.data ?? []
  const remaining = list.filter(v => !['completed', 'cancelled'].includes(v.status))
  const open = list.filter(v => ['history', 'notes'].includes(v.access))
  const overdue = list.filter(v => v.patient_phone)
  const patient = me.role === W.patient
  const admin = me.role === W.admin
  const highlights = [
    ['calendar', 'Appointment', remaining.length, 'appointments'],
    [admin ? 'clock' : 'file', admin ? 'Perlu dihubungi' : patient ? 'Kunjungan selesai' : 'Akses pemeriksaan', admin ? overdue.length : patient ? list.filter(v => v.status === 'completed').length : open.length, patient || admin ? 'appointments' : 'records'],
    ['shield', patient ? 'Izin dokter' : 'Direktori dokter', null, patient ? 'permissions' : 'directory'],
  ]
  return <>
    <section className="welcome">
      <div><p className="eyebrow">{admin ? 'Administrasi' : patient ? 'Ruang pasien' : 'Workspace dokter'}</p>
        <h1>{me.profile?.name ? 'Halo, ' + me.profile.name : 'Selamat datang di RuangSehat'}</h1>
        <p>{admin ? 'Pantau kunjungan, check-in, dan tagihan pasien.' : patient ? 'Cek jadwal kunjungan dan kelola izin rekam medis Anda.' : 'Lihat pasien yang dijadwalkan dan lanjutkan pemeriksaan.'}</p>
        <button onClick={() => navigate(patient ? 'records' : 'appointments')}>{patient ? 'Buka rekam medis saya' : 'Buka appointment'}<Icon name="arrow" /></button>
      </div>
      <div className="hero-art"><Icon name="cross" /></div>
    </section>
    <Feedback error={visits.error} />
    <div className="stats">{highlights.map(([icon, label, count, page]) =>
      <button type="button" className="stat" key={label} onClick={() => navigate(page)}>
        <span className="mini-icon"><Icon name={icon} /></span><span>{label}{count !== null && <strong>{visits.loading && !visits.data ? '—' : count}</strong>}</span><Icon name="arrow" />
      </button>)}</div>
    <div className="overview-grid">
      <Panel title="Kunjungan terdekat" actions={<button className="secondary" onClick={() => navigate('appointments')}>Lihat jadwal</button>}>
        {remaining.length ? <div className="list">{[...remaining].sort((a,b) => a.starts - b.starts).slice(0, 5).map(v => <div key={v.id} className="list-row">
          <span className="mini-icon"><Icon name="calendar" /></span><div><strong>{patient ? v.doctor_name : v.patient_name}</strong><small>{fmt.format(v.starts)} WIB</small></div><VisitStatus visit={v} />
        </div>)}</div> : <Empty title={visits.loading ? 'Memuat jadwal…' : 'Belum ada kunjungan aktif'} icon="calendar" />}
      </Panel>
      <Panel title={admin ? 'Pasien yang perlu dihubungi' : 'Akses rekam medis'}>
        {admin && overdue.length ? overdue.slice(0, 5).map(v => <div className="list-row" key={v.id}><div><strong>{v.patient_name}</strong><small>{v.patient_phone}</small></div><VisitStatus visit={v} /></div>)
          : admin ? <Empty title="Belum ada pasien yang perlu dihubungi" icon="clock" />
          : <div className="privacy-note"><span className="mini-icon"><Icon name="shield" /></span><div><strong>Izin pasien dan check-in</strong><p>Dokter yang ditugaskan membuka riwayat selama jadwal aktif. Setelah itu, tersisa 30 menit untuk catatan kunjungan.</p></div></div>}
      </Panel>
    </div>
  </>
}

export function Directory({ api }) {
  const doctors = useLoad(signal => api('/doctors', { signal }))
  const [query, setQuery] = useState('')
  const results = (doctors.data ?? []).filter(d => [d.name, d.specialty, d.clinic].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    <div className="page-title"><div><h1>Direktori Dokter</h1><p>Cari dokter berdasarkan nama, spesialisasi, atau poli.</p></div>
      <input className="search" aria-label="Cari dokter" placeholder="Cari dokter atau poli…" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <Feedback error={doctors.error} />
    {results.length ? <div className="directory-grid">{results.map(d => <article className="panel doctor-card" key={d.wallet}>
      <div className="doctor-top"><span className="avatar large">{d.name[0]}</span><Pill>{d.clinic || 'Dokter'}</Pill></div>
      <div><h2>{d.name}</h2><p>{d.specialty}</p></div>{d.bio && <p>{d.bio}</p>}<code title={d.wallet}>{short(d.wallet)}</code>
    </article>)}</div> : <Panel><Empty title={doctors.loading ? 'Memuat direktori…' : 'Dokter tidak ditemukan'} icon="people">Coba nama atau spesialisasi lain.</Empty></Panel>}
  </>
}

export function Profiles({ me, api, refresh }) {
  const [data, setData] = useState(me.profile ?? {})
  const action = useAction()
  const reset = key => value => setData(previous => ({ ...previous, [key]: value }))
  const doctor = me.role === W.doctor
  const patient = me.role === W.patient
  return <>
    <div className="page-title"><div><h1>Profil Saya</h1><p>{doctor ? 'Atur informasi yang muncul di direktori dokter.' : 'Kelola informasi profil akun Anda.'}</p></div></div>
    <div className="overview-grid">
      <Panel title="Informasi profil">
        <form className="form-grid" onSubmit={e => {e.preventDefault(); action.run(async () => {
          await api('/profiles/me', { method: 'PUT', body: data })
          await refresh()
        }, 'Profil disimpan.')}}>
          <Field label="Nama lengkap" required value={data.name ?? ''} maxLength={100} onChange={reset('name')} />
          {doctor && <>
            <Field label="Spesialisasi" required value={data.specialty ?? ''} maxLength={90} onChange={reset('specialty')} />
            <Field label="Poli" value={data.clinic ?? ''} maxLength={90} onChange={reset('clinic')} />
            <Field label="Bidang yang ditangani" type="textarea" className="span-all" value={data.bio ?? ''} maxLength={400} onChange={reset('bio')} />
          </>}
          {patient && <>
            <Field label="Nomor telepon" type="tel" value={data.phone ?? ''} maxLength={40} onChange={reset('phone')} />
            <Field label="Tanggal lahir" type="date" value={data.birth_date ?? ''} onChange={reset('birth_date')} />
            <Field label="Gender" value={data.gender ?? ''} maxLength={40} onChange={reset('gender')} />
          </>}
          <div className="actions span-all"><button type="submit" disabled={action.busy}>Simpan profil</button>
            {me.profile && <button type="button" className="danger" disabled={action.busy} onClick={() => {
              if (window.confirm('Hapus data profil Anda?')) action.run(async () => { await api('/profiles/me', { method: 'DELETE' }); setData({}); await refresh() }, 'Profil dihapus.')
            }}>Hapus profil</button>}</div>
        </form>
        <Feedback {...action} />
      </Panel>
      <Panel title="Wallet terhubung"><code className="long-code">{me.wallet}</code>
        <p>Peran wallet ditetapkan oleh admin melalui kontrak.</p></Panel>
    </div>
  </>
}

export function Permissions({ api, writeChain }) {
  const directory = useLoad(signal => api('/doctors', { signal }))
  const [doctor, setDoctor] = useState('')
  const [result, setResult] = useState(null)
  const action = useAction()
  function lookup(wallet) { return api('/permissions?doctor=' + encodeURIComponent(wallet)) }
  async function change(enabled) {
    await action.run(async () => {
      await writeChain('setDoctorAuthorization', [doctor.trim(), enabled], '/demo/permissions', { doctor: doctor.trim(), enabled })
      const next = await lookup(doctor.trim())
      setResult(next.enabled)
    }, enabled ? 'Izin dokter diberikan.' : 'Izin dokter dicabut.')
  }
  return <>
    <div className="page-title"><div><h1>Izin Dokter</h1><p>Atur dokter yang boleh mendapat akses selama appointment Anda.</p></div></div>
    <Panel title="Kelola persetujuan" description="Pilih dari direktori atau masukkan alamat wallet dokter.">
      <form className="form-grid" onSubmit={e => {e.preventDefault(); action.run(async () => setResult((await lookup(doctor.trim())).enabled))}}>
        <Field label="Dokter di direktori" value={(directory.data ?? []).some(d => d.wallet === doctor) ? doctor : ''} onChange={value => { setDoctor(value); setResult(null) }}
          options={[{value:'',label:'Pilih dokter'}, ...(directory.data ?? []).map(d => ({value:d.wallet,label:d.name + ' · ' + d.specialty}))]} />
        <Field label="Wallet dokter" placeholder="0x…" value={doctor} required onChange={value => { setDoctor(value); setResult(null) }} />
        <div className="actions span-all">
          <button type="submit" className="secondary" disabled={action.busy || !doctor.trim()}>Cek izin</button>
          <button type="button" onClick={() => change(true)} disabled={action.busy || !doctor.trim()}>Berikan izin</button>
          <button type="button" className="danger" onClick={() => change(false)} disabled={action.busy || !doctor.trim()}>Cabut izin</button>
          {result !== null && <Pill tone={result ? 'mint' : 'amber'}>{result ? 'Izin aktif' : 'Izin tidak aktif'}</Pill>}
        </div>
      </form>
      <Feedback error={directory.error || action.error} message={action.message} />
    </Panel>
  </>
}

export function RoleManagement({ api, writeChain }) {
  const users = useLoad(signal => api('/users', { signal }))
  const [wallet, setWallet] = useState('')
  const [role, setRole] = useState('2')
  const action = useAction()
  return <>
    <div className="page-title"><div><h1>Pengguna & Peran</h1><p>Atur peran wallet Admin, Dokter, dan Pasien.</p></div><Pill>On-chain</Pill></div>
    <div className="overview-grid">
      <Panel title="Tetapkan peran">
        <form className="form-grid" onSubmit={e => {e.preventDefault(); action.run(async () => {
          await writeChain('assignRole', [wallet.trim(), Number(role)], '/demo/roles', {wallet:wallet.trim(),role:Number(role)})
          setWallet('')
          users.reload()
        }, 'Peran wallet berhasil diperbarui.')}}>
          <Field label="Alamat wallet" value={wallet} required placeholder="0x…" onChange={setWallet} />
          <Field label="Peran" value={role} onChange={setRole} options={[{value:'2',label:'Dokter'},{value:'3',label:'Pasien'},{value:'0',label:'Cabut peran'}]} />
          <div className="actions span-all"><button disabled={action.busy}>{action.busy ? 'Menunggu konfirmasi…' : 'Simpan peran'}</button></div>
        </form>
        <Feedback {...action} />
      </Panel>
      <Panel title="Profil terdaftar">
        <Feedback error={users.error} />
        <div className="list">{(users.data ?? []).map(u => <div className="list-row" key={u.wallet}>
          <span className="mini-icon"><Icon name="user" /></span><div><strong>{u.name}</strong><small>{u.specialty || short(u.wallet)}</small></div>
          <button className="secondary" onClick={() => setWallet(u.wallet)}>Pilih</button></div>)}</div>
        {!users.data?.length && <Empty title="Belum ada profil" icon="people" />}
      </Panel>
    </div>
  </>
}
