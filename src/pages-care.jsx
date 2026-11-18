import { useEffect, useState } from 'react'
import { Empty, Feedback, Field, Icon, Panel, Pill, VisitStatus } from './ui'
import { asInput, day, fmt, parseWib, rupiah, short, W } from './format'
import { useAction, useLoad } from './hooks'

const duration = 30 * 60_000
const initialVisit = () => ({ patient: '', doctor: '', starts: asInput(Date.now() + 30 * 60_000), ends: asInput(Date.now() + 90 * 60_000) })
const moneyStatus = { unpaid: ['Belum dibayar', 'amber'], paid: ['Lunas', 'mint'], void: ['Dibatalkan', 'rose'] }
const reasons = ['Kecelakaan', 'Pingsan / tidak sadar', 'Henti jantung', 'Stroke', 'Muntah darah', 'Lainnya']

function useClock() {
  const [time, setTime] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return time
}

export function Appointments({ api, me, navigate, setVisit }) {
  const visits = useLoad(signal => api('/appointments', { signal }))
  const [date, setDate] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(initialVisit)
  const action = useAction()
  const admin = me.role === W.admin
  const time = useClock()
  const choose = key => value => setForm(data => ({ ...data, [key]: value }))
  const entries = (visits.data ?? []).filter(v => !date || day.format(v.starts) === date)

  function open(item) {
    setEditor(item?.id ?? 'new')
    setForm(item ? { patient: item.patient, doctor: item.doctor, starts: asInput(item.starts), ends: asInput(item.ends) } : initialVisit())
  }
  async function change(visit, operation) {
    if (['cancel', 'delete'].includes(operation) && !window.confirm(operation === 'delete' ? 'Hapus appointment ini?' : 'Batalkan appointment ini?')) return
    const result = await action.run(() => api('/appointments/' + visit.id, operation === 'delete'
      ? { method:'DELETE' } : { method:'PATCH', body:{action:operation} }), 'Status appointment diperbarui.')
    if (result) visits.reload()
  }
  return <>
    <div className="page-title"><div><h1>Appointment</h1><p>Jadwal kunjungan, check-in, dan status pertemuan dalam WIB.</p></div>
      {admin && <button onClick={() => open()}><Icon name="calendar" />Buat appointment</button>}</div>
    <Feedback error={visits.error || action.error} message={action.message} />
    {editor && <Panel title={editor === 'new' ? 'Appointment baru' : 'Ubah jam appointment'} actions={<button className="secondary" onClick={() => setEditor(null)}>Tutup</button>}>
      <form className="form-grid" onSubmit={e => {e.preventDefault(); action.run(async () => {
        const timing = { starts:parseWib(form.starts), ends:parseWib(form.ends) }
        if (editor === 'new') await api('/appointments', {method:'POST',body:{...form,...timing}})
        else await api('/appointments/' + editor, {method:'PATCH',body:{action:'reschedule',...timing}})
        setEditor(null)
        visits.reload()
      },'Appointment disimpan.')}}>
        {editor === 'new' && <>
          <Field label="Wallet pasien" value={form.patient} onChange={choose('patient')} required placeholder="0x…" />
          <Field label="Wallet dokter" value={form.doctor} onChange={choose('doctor')} required placeholder="0x…" />
        </>}
        <Field label="Mulai (WIB)" type="datetime-local" required value={form.starts} onChange={choose('starts')} />
        <Field label="Selesai (WIB)" type="datetime-local" required value={form.ends} onChange={choose('ends')} />
        <div className="actions span-all"><button disabled={action.busy}>Simpan jadwal</button></div>
      </form>
    </Panel>}
    <Panel title="Jadwal kunjungan" actions={<div className="actions"><input type="date" aria-label="Filter tanggal jadwal" value={date} onChange={e => setDate(e.target.value)} />
      {date && <button className="secondary" onClick={() => setDate('')}>Semua tanggal</button>}</div>}>
      {entries.length ? <div className="table-wrap"><table><thead><tr><th>Pasien</th><th>Dokter</th><th>Waktu kunjungan</th><th>Status</th><th>Tindakan</th></tr></thead>
        <tbody>{entries.map(v => <tr key={v.id}><td><strong>{v.patient_name}</strong>{v.patient_phone && <small className="cell-detail">{v.patient_phone}</small>}</td>
          <td>{v.doctor_name}</td><td>{fmt.format(v.starts)}<small className="cell-detail">Selesai {fmt.format(v.ends)}</small></td><td><VisitStatus visit={v} /></td>
          <td><div className="actions compact">
            {admin && v.status === 'scheduled' && <><button className="secondary" disabled={action.busy || time >= v.ends} onClick={() => change(v,'check_in')}>Check-in</button>
              <button className="secondary" onClick={() => open(v)}>Ubah jadwal</button></>}
            {admin && v.status === 'checked_in' && <button className="secondary" disabled={action.busy || time < v.starts} onClick={() => change(v,'complete')}>Selesai</button>}
            {admin && ['scheduled','checked_in'].includes(v.status) && <button className="danger" disabled={action.busy} onClick={() => change(v,'cancel')}>Batalkan</button>}
            {admin && ['scheduled','cancelled'].includes(v.status) && <button className="quiet" disabled={action.busy} onClick={() => change(v,'delete')}>Hapus</button>}
            {me.role === W.doctor && v.access !== 'closed' && <button onClick={() => { setVisit(v.id); navigate('records') }}>Buka pemeriksaan</button>}
            {!admin && (me.role !== W.doctor || v.access === 'closed') && <span className="muted">—</span>}
          </div></td></tr>)}</tbody></table></div> : <Empty icon="calendar" title={visits.loading ? 'Memuat appointment…' : 'Tidak ada appointment'}>Pilih tanggal lain atau lihat semua jadwal.</Empty>}
    </Panel>
  </>
}

export function Billing({ api, me }) {
  const admin = me.role === W.admin
  const bills = useLoad(signal => api('/bills', { signal }))
  const visits = useLoad(signal => api('/appointments', { signal }))
  const [form, setForm] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const action = useAction()
  const change = key => value => setForm(data => ({ ...data,[key]:value }))
  return <>
    <div className="page-title"><div><h1>{admin ? 'Kasir & Pembayaran' : 'Tagihan & Struk'}</h1><p>{admin ? 'Catat tagihan dan verifikasi status pembayaran secara manual.' : 'Lihat status tagihan dan cetak struk yang sudah lunas.'}</p></div>
      {admin && <button onClick={() => setForm({appointment:'',description:'',amount:'',status:'unpaid'})}>Buat tagihan</button>}</div>
    <Feedback error={bills.error || visits.error || action.error} message={action.message} />
    {form && <Panel title="Rincian tagihan" actions={<button className="secondary" onClick={() => setForm(null)}>Tutup</button>}>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); action.run(async () => {
        await api('/bills',{method:'PUT',body:form}); setForm(null); setReceipt(null); bills.reload()
      },'Tagihan disimpan.') }}>
        <Field label="Kunjungan" required disabled={Boolean(form.id)} value={form.appointment} onChange={change('appointment')} options={[{value:'',label:'Pilih kunjungan'}, ...(visits.data ?? []).map(v => ({value:v.id,label:v.patient_name+' · '+fmt.format(v.starts)}))]} />
        <Field label="Nominal (Rp)" type="number" min={1} required value={form.amount} onChange={change('amount')} />
        <Field label="Deskripsi biaya" required maxLength={500} value={form.description} onChange={change('description')} />
        <Field label="Status pembayaran" value={form.status} onChange={change('status')} options={Object.entries(moneyStatus).map(([value,[label]]) => ({value,label}))} />
        <div className="actions span-all"><button disabled={action.busy}>Simpan status</button></div>
      </form>
    </Panel>}
    {receipt && <Panel className="receipt" title="Struk pembayaran" actions={<div className="actions no-print"><button className="secondary" onClick={() => setReceipt(null)}>Tutup</button><button onClick={() => window.print()}>Cetak struk</button></div>}>
      <dl className="details">
        <div><dt>Nomor struk</dt><dd>{receipt.id}</dd></div><div><dt>Waktu pencatatan</dt><dd>{fmt.format(receipt.updated)} WIB</dd></div>
        <div><dt>Rincian</dt><dd>{receipt.description}</dd></div><div><dt>Jumlah</dt><dd>{rupiah(receipt.amount)}</dd></div>
        <div><dt>Status</dt><dd>Lunas</dd></div>
      </dl>
    </Panel>}
    <Panel title="Daftar tagihan">
      {bills.data?.length ? <div className="table-wrap"><table><thead><tr><th>Rincian</th><th>Nominal</th><th>Status</th><th>Tindakan</th></tr></thead>
        <tbody>{bills.data.map(b => <tr key={b.id}><td>{b.description}<small className="cell-detail">{fmt.format(b.updated)} WIB</small></td>
          <td><strong>{rupiah(b.amount)}</strong></td><td><Pill tone={moneyStatus[b.status][1]}>{moneyStatus[b.status][0]}</Pill></td>
          <td><div className="actions compact">{b.status === 'paid' && <button className="secondary" onClick={() => setReceipt(b)}>Buka struk</button>}
            {admin && b.status !== 'void' && <button className="secondary" onClick={() => setForm({...b,amount:String(b.amount)})}>Ubah tagihan</button>}
            {admin && b.status === 'unpaid' && <button className="secondary" disabled={action.busy} onClick={() => {
              if (!window.confirm('Hapus tagihan yang belum dibayar ini?')) return
              action.run(async () => {
                await api('/bills/'+b.id,{method:'DELETE'})
                if (form?.id === b.id) setForm(null)
                bills.reload()
              },'Tagihan dihapus.')
            }}>Hapus tagihan</button>}</div></td>
        </tr>)}</tbody></table></div> : <Empty title={bills.loading ? 'Memuat tagihan…' : 'Belum ada tagihan'} icon="wallet" />}
    </Panel>
  </>
}

const recordFields = [
  ['complaint','Keluhan',true],['diagnosis','Diagnosis',true],['treatment','Tindakan / hasil pemeriksaan'],
  ['history','Riwayat penyakit'],['allergies','Alergi'],['medications','Obat & aturan pakai'],
  ['height','Tinggi badan (cm)'],['weight','Berat badan (kg)'],
]
function RecordCard({ record, own, onEdit, onDeactivate, onSync, disabled }) {
  const [selected, setSelected] = useState('')
  const latest = record.versions[0]
  const version = record.versions.find(v => String(v.version) === selected) ?? latest
  return <Panel title={'Rekam medis ' + short(record.id)} description={latest ? fmt.format(latest.created) + ' WIB' : 'Pemeriksaan baru'}
    actions={<Pill tone={record.pending ? 'amber' : latest?.active ? 'mint' : 'rose'}>{record.pending ? 'Menunggu bukti' : latest?.active ? 'Aktif' : 'Dinonaktifkan'}</Pill>}>
    {version && <details className="record-detail"><summary>Lihat isi pemeriksaan</summary>
      {record.versions.length > 1 && <Field label="Versi" value={String(version.version)} onChange={setSelected}
        options={record.versions.map(v => ({value:String(v.version),label:'Versi '+v.version+' · '+fmt.format(v.created)}))} />}
      {version.active && <dl className="details">{recordFields.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{version.body[key] || '—'}</dd></div>)}</dl>}
      {version.body.reason && <p><strong>{version.active ? 'Alasan revisi' : 'Alasan penonaktifan'}</strong> · {version.body.reason}</p>}
      <div className="proof"><Icon name="shield" /><div><strong>{version.integral ? 'Bukti versi tercatat' : 'Isi tidak cocok dengan hash'}</strong><code>{version.commitment}</code></div></div>
    </details>}
    {own && <div className="actions">
      {record.pending ? <button className="secondary" disabled={disabled} onClick={onSync}>Sinkronkan bukti</button> : latest?.active && <>
        <button className="secondary" disabled={disabled} onClick={() => onEdit(latest)}>Revisi catatan</button>
        <button className="danger" disabled={disabled} onClick={() => onDeactivate(latest)}>Nonaktifkan</button>
      </>}
    </div>}
  </Panel>
}

export function Records({ me, api, visit, setVisit }) {
  const doctor = me.role === W.doctor
  const visits = useLoad(signal => doctor ? api('/appointments', { signal }) : Promise.resolve([]), doctor ? 'doctor' : 'patient')
  const reloadVisits = visits.reload
  useEffect(() => {
    if (!doctor) return
    const timer = setInterval(reloadVisits, 15_000)
    return () => clearInterval(timer)
  }, [doctor, reloadVisits])
  const available = (visits.data ?? []).filter(row => row.access !== 'closed')
  const choice = available.find(row => row.id === visit) || available[0]
  return <>
    <div className="page-title"><div><h1>{doctor ? 'Rekam Medis' : 'Rekam Medis Saya'}</h1><p>{doctor ? 'Pilih kunjungan yang masih memiliki akses aktif.' : 'Buka pemeriksaan, versi catatan, dan bukti integritasnya.'}</p></div></div>
    <Feedback error={visits.error} />
    {doctor && <Panel title="Kunjungan aktif"><Field label="Pilih appointment" value={choice?.id ?? ''} onChange={setVisit}
      options={available.length ? available.map(row => ({value:row.id,label:row.patient_name+' · '+fmt.format(row.starts)}))
        : [{value:'',label:visits.loading ? 'Memuat izin…' : 'Tidak ada akses aktif'}]} /></Panel>}
    {(!doctor || choice) ? <RecordWork key={choice?.id ?? 'self'} {...{ me, api, doctor, choice }} />
      : <Panel><Empty icon="shield" title="Tidak ada pemeriksaan yang terbuka">Butuh izin pasien dan appointment yang sudah check-in.</Empty></Panel>}
  </>
}

function RecordWork({ me, api, doctor, choice }) {
  const time = useClock()
  const phase = !doctor ? 'patient' : time >= choice.ends + duration ? 'closed'
    : choice.access === 'history' && time < choice.ends ? 'history' : 'notes'
  const data = useLoad(signal => phase === 'closed' ? Promise.resolve([]) : api('/records' + (doctor ? '?appointment=' + choice.id : ''), { signal }), phase)
  const [edit, setEdit] = useState(null)
  const action = useAction()
  const reloadRecords = data.reload
  useEffect(() => {
    if (!doctor || phase === 'closed') return
    const timer = setInterval(reloadRecords, 12_000)
    return () => clearInterval(timer)
  }, [doctor, phase, reloadRecords])
  const rows = phase === 'closed' ? [] : (data.data ?? []).filter(record => phase !== 'notes' || record.appointment === choice.id)
  const current = doctor && rows.find(row => row.appointment === choice.id)
  const left = doctor ? Math.max(0, Math.ceil(((phase === 'history' ? choice.ends : choice.ends + duration) - time) / 1000)) : 0
  const clock = [Math.floor(left / 3600), Math.floor(left / 60) % 60, left % 60].map(part => String(part).padStart(2,'0')).join(':')
  async function save(contents) {
    const result = await action.run(() => api('/records', {method:'POST',body:{...contents,appointment:choice.id}}),
      result => result.pending ? 'Versi sudah disimpan. Gunakan Sinkronkan bukti untuk memeriksa transaksi.' : 'Versi dan bukti on-chain sudah tercatat.')
    if (result) { setEdit(null); data.reload() }
  }
  return <>
    {doctor && <div className="access-banner"><Icon name="clock" /><div><strong>{phase === 'history' ? 'Riwayat dan catatan terbuka' : phase === 'notes' ? 'Masa tambahan catatan kunjungan' : 'Akses sudah berakhir'}</strong>
      <p>{choice.patient_name} · {phase === 'notes' ? 'Riwayat lengkap ditutup' : fmt.format(choice.ends) + ' WIB'}</p></div>
      {phase !== 'closed' && <code>{clock}</code>}</div>}
    <Feedback error={data.error || action.error} message={action.message} />
    {doctor && phase !== 'closed' && !current && !edit && !data.loading && !data.error && <div><button onClick={() => setEdit({expected_version:0})}>Tulis pemeriksaan</button></div>}
    {doctor && phase !== 'closed' && edit && <Panel title={edit.action === 'deactivate' ? 'Nonaktifkan record' : edit.expected_version ? 'Revisi catatan' : 'Pemeriksaan baru'}
      actions={<button className="secondary" onClick={() => setEdit(null)}>Batal</button>}>
      <form className="form-grid" onSubmit={e => {e.preventDefault(); save(edit)}}>
        {edit.action !== 'deactivate' && recordFields.map(([key,label,required]) =>
          <Field key={key} label={label} required={required} type={['height','weight'].includes(key) ? 'text' : 'textarea'} value={edit[key] ?? ''}
            onChange={value => setEdit(previous => ({...previous,[key]:value}))} />)}
        {edit.expected_version > 0 && <Field label="Alasan perubahan" required type="textarea" maxLength={400} value={edit.reason ?? ''}
          onChange={value => setEdit(previous => ({...previous,reason:value}))} />}
        <div className="actions span-all"><button disabled={action.busy}>{action.busy ? 'Menunggu bukti…' : 'Simpan versi'}</button></div>
      </form>
    </Panel>}
    {rows.map(row => <RecordCard key={row.id} record={row} own={doctor && row.doctor === me.wallet && row.appointment === choice.id} disabled={action.busy}
      onEdit={version => setEdit({...version.body,reason:'',expected_version:version.version})}
      onDeactivate={version => setEdit({action:'deactivate',expected_version:version.version})}
      onSync={() => save({action:'sync'})} />)}
    {!rows.length && <Panel><Empty title={phase === 'closed' ? 'Jendela akses sudah berakhir' : data.loading ? 'Memuat pemeriksaan…' : 'Belum ada rekam medis'} /></Panel>}
  </>
}

export function Emergency({ me, api, terminal, setDevice }) {
  const [name, setName] = useState('')
  const [patient, setPatient] = useState('')
  const [reason, setReason] = useState(reasons[0])
  const [report, setReport] = useState(null)
  const [summary, setSummary] = useState(null)
  const action = useAction()
  const log = useLoad(signal => api('/emergencies',{signal}))
  const device = useLoad(signal => api('/terminal',{signal}), terminal)
  const time = useClock()
  const staff = [W.admin,W.doctor].includes(me.role)
  async function operate(event, operation, body) {
    const result = await action.run(() => api('/emergencies/'+event.id+'/'+operation,
      operation === 'summary' ? {} : {method:'POST',body}), '')
    if (!result) return
    if (operation === 'summary') setSummary(result)
    else { setSummary(null); setReport(null); log.reload() }
  }
  return <>
    <div className="page-title"><div><h1>Akses Darurat IGD</h1><p>Ringkasan medis selama 30 menit. Aktivitas tercatat untuk pemeriksaan.</p></div></div>
    <Feedback error={action.error || log.error || device.error} message={action.message} />
    {staff && <div className="overview-grid">
      <Panel title="Aktifkan akses darurat" description="Khusus petugas di browser yang telah didaftarkan.">
        <form className="form-grid" onSubmit={e => { e.preventDefault(); action.run(async () => {
          const event = await api('/emergencies',{method:'POST',body:{patient,reason}})
          setSummary(await api('/emergencies/'+event.id+'/summary'))
          log.reload()
        },'Akses darurat aktif.')}}>
          <Field label="Wallet pasien" value={patient} onChange={setPatient} required placeholder="0x…" />
          <Field label="Alasan" value={reason} onChange={setReason} options={reasons.map(value => ({value,label:value}))} />
          <div className="actions span-all"><button className="danger" disabled={!device.data?.enrolled || action.busy}>Aktifkan & catat</button></div>
        </form>
      </Panel>
      <Panel title="Terminal IGD" description={device.data?.enrolled ? device.data.name : 'Browser ini belum terdaftar.'}>
        {me.role === W.admin && (device.data?.enrolled ? <button className="danger" onClick={() => action.run(async () => {
          await api('/terminal',{method:'DELETE'}); setDevice(''); setSummary(null)
        },'Terminal dicabut.')}>Cabut browser ini</button> : <form className="form-grid" onSubmit={e => {e.preventDefault(); action.run(async () => {
          const result = await api('/terminal',{method:'POST',body:{name}}); setDevice(result.token)
        },'Terminal didaftarkan.')}}>
          <Field label="Nama terminal" value={name} onChange={setName} required /><div className="actions"><button disabled={action.busy}>Daftarkan browser</button></div></form>)}
      </Panel>
    </div>}
    {summary && time < summary.ends && <Panel title="Ringkasan medis darurat" description={'Akses sampai ' + fmt.format(summary.ends) + ' WIB'}
      actions={<button className="secondary" onClick={() => setSummary(null)}>Tutup ringkasan</button>}>
      <dl className="details">{[['name','Nama'],['gender','Gender'],['height','Tinggi'],['weight','Berat'],['history','Riwayat penyakit'],['allergies','Alergi'],['medications','Obat']].map(([key,label]) =>
        <div key={key}><dt>{label}</dt><dd>{summary[key] || 'Belum tersedia'}</dd></div>)}</dl>
    </Panel>}
    <Panel title="Aktivitas akses darurat" actions={<button className="secondary" onClick={log.reload}>Muat ulang</button>}>
      {log.data?.length ? <div className="list">{log.data.map(event => {
        const active = !event.closed && time < event.ends
        return <div key={event.id} className="list-row"><div><strong>{event.reason}</strong><small>{fmt.format(event.starts)} WIB · Pasien {short(event.patient)} · Petugas {short(event.actor)}</small>
          {event.report && <small>{event.report}</small>}</div><Pill tone={active ? 'amber' : 'mint'}>{active ? 'Aktif' : 'Berakhir'}</Pill>
          {staff && event.actor === me.wallet && <div className="actions compact">
            {active && <><button className="secondary" disabled={!device.data?.enrolled} onClick={() => operate(event,'summary')}>Buka ringkasan</button>
              <button className="danger" onClick={() => operate(event,'close')}>Akhiri akses</button></>}
            {!active && event.reason === 'Lainnya' && !event.report && <button className="secondary" onClick={() => setReport({event,text:''})}>Lengkapi alasan</button>}
          </div>}</div>
      })}</div> : <Empty title={log.loading ? 'Memuat aktivitas…' : 'Belum ada aktivitas darurat'} icon="cross" />}
    </Panel>
    {report && <Panel title="Lengkapi alasan darurat"><form className="form-grid" onSubmit={e => {e.preventDefault(); operate(report.event,'report',{report:report.text})}}>
      <Field label="Penjelasan" required type="textarea" maxLength={1200} value={report.text} onChange={text => setReport(previous => ({...previous,text}))} />
      <div className="actions"><button type="submit" disabled={action.busy}>Simpan laporan</button><button type="button" className="secondary" onClick={() => setReport(null)}>Batal</button></div>
    </form></Panel>}
  </>
}
