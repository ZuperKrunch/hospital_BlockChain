import { useState } from 'react'
import MedicalForm from './MedicalForm'
import { displayMeasure, formatDate, shortWallet, TEXT_FIELDS } from './medical'

export default function RecordsTable({ records, total, page, onPage, busy, account, patient, editingId, editForm, setEditForm, onEdit, onCancel, onSave, onDelete }) {
  const [expandedId, setExpandedId] = useState(null)
  if (records === null) return null
  return (
    <section className="records-section">
      <h3>Riwayat Pemeriksaan</h3>
      <p className="address">Wallet pasien: {patient}</p>
      <p>{total} record · Terbaru lebih dulu · 10 record per halaman</p>
      {total === 0 ? <p>Belum ada rekam medis.</p> : <>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel riwayat pemeriksaan">
          <table>
            <thead><tr><th>ID / Dibuat</th><th>Pasien</th><th>Tinggi / Berat</th><th>Diagnosis</th><th>Dokter</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{records.map(record => {
              const editing = editingId === record.id
              const expanded = expandedId === record.id || editing
              const canEdit = !!onEdit && record.isActive && record.doctor.toLowerCase() === account.toLowerCase()
              return <RecordRows key={record.id} record={record} expanded={expanded} editing={editing} canEdit={canEdit}
                busy={busy} editLocked={editingId !== null} editForm={editForm} setEditForm={setEditForm}
                onToggle={() => setExpandedId(expanded ? null : record.id)}
                onEdit={() => onEdit(record)} onCancel={onCancel} onSave={onSave} onDelete={() => onDelete(record.id)} />
            })}</tbody>
          </table>
        </div>
        <nav className="pagination" aria-label="Halaman riwayat">
          <button type="button" className="secondary-button" disabled={busy || editingId !== null || page === 0} onClick={() => onPage(page - 1)}>Sebelumnya</button>
          <span>Halaman {page + 1} / {Math.max(1, Math.ceil(total / 10))}</span>
          <button type="button" className="secondary-button" disabled={busy || editingId !== null || (page + 1) * 10 >= total} onClick={() => onPage(page + 1)}>Berikutnya</button>
        </nav>
      </>}
    </section>
  )
}

function RecordRows({ record: r, expanded, editing, canEdit, busy, editLocked, editForm, setEditForm, onToggle, onEdit, onCancel, onSave, onDelete }) {
  return <>
    <tr>
      <td><strong>#{r.id}</strong><br />{formatDate(r.createdAt)}</td>
      <td>{r.data.patientName}</td>
      <td>{displayMeasure(r.data.heightCmX10, 'cm')}<br />{displayMeasure(r.data.weightKgX10, 'kg')}</td>
      <td className="diagnosis-cell">{r.data.diagnosis}</td>
      <td><span title={r.doctor} className="address">{shortWallet(r.doctor)}</span></td>
      <td><span className={`status-badge ${r.isActive ? 'active' : 'deleted'}`}>{r.isActive ? 'Aktif' : 'Deleted'}</span></td>
      <td><div className="table-actions">
        <button type="button" className="secondary-button" disabled={busy || editing} aria-expanded={expanded} aria-controls={`detail-${r.id}`} onClick={onToggle}>{expanded ? 'Tutup Detail' : 'Lihat Detail'}</button>
        {canEdit && <>
          <button type="button" disabled={busy || editLocked} onClick={onEdit}>Edit</button>
          <button type="button" className="danger-button" disabled={busy || editLocked} onClick={onDelete}>Delete</button>
        </>}
      </div></td>
    </tr>
    {expanded && <tr id={`detail-${r.id}`} className="detail-row"><td colSpan={7}>
      {editing ? <><h4>Edit Record #{r.id}</h4><MedicalForm value={editForm} onChange={setEditForm} onSubmit={onSave} disabled={busy} prefix={`edit-${r.id}`} submitLabel="Simpan Perubahan" onCancel={onCancel} /></> : <>
        <h4>Detail Record #{r.id} — {r.data.patientName}</h4>
        <dl className="detail-grid">
          <div><dt>Tanggal lahir</dt><dd>{r.data.birthDate || 'Belum dicatat'}</dd></div>
          <div><dt>Jenis kelamin</dt><dd>{r.data.gender || 'Belum dicatat'}</dd></div>
          <div><dt>Golongan darah</dt><dd>{r.data.bloodType || 'Belum diketahui'}</dd></div>
          <div><dt>Tinggi badan</dt><dd>{displayMeasure(r.data.heightCmX10, 'cm')}</dd></div>
          <div><dt>Berat badan</dt><dd>{displayMeasure(r.data.weightKgX10, 'kg')}</dd></div>
          {TEXT_FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{r.data[key] || 'Belum dicatat'}</dd></div>)}
        </dl>
        <p className="address">Dokter pembuat: {r.doctor}</p>
        <p>Dibuat: {formatDate(r.createdAt)}<br />Terakhir diubah: {formatDate(r.updatedAt)}</p>
        {!r.isActive && <p>Record dinonaktifkan. Isi sebelumnya tetap tersimpan di blockchain.</p>}
      </>}
    </td></tr>}
  </>
}
