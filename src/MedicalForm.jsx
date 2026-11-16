import { localToday, TEXT_FIELDS } from './medical'

export default function MedicalForm({ value, onChange, onSubmit, disabled, prefix, submitLabel, onCancel }) {
  function update(key, next) { onChange({ ...value, [key]: next }) }
  return (
    <form onSubmit={onSubmit} className="medical-form">
      <fieldset disabled={disabled}>
        <legend>Data pasien saat pemeriksaan</legend>
        <div className="form-grid">
          <label htmlFor={`${prefix}-name`}>Nama pasien *
            <input id={`${prefix}-name`} value={value.patientName} maxLength={120} required onChange={e => update('patientName', e.target.value)} />
          </label>
          <label htmlFor={`${prefix}-birth`}>Tanggal lahir
            <input id={`${prefix}-birth`} type="date" max={localToday()} value={value.birthDate} onChange={e => update('birthDate', e.target.value)} />
          </label>
          <label htmlFor={`${prefix}-gender`}>Jenis kelamin
            <select id={`${prefix}-gender`} value={value.gender} onChange={e => update('gender', e.target.value)}>
              <option value="">Belum dicatat</option><option>Laki-laki</option><option>Perempuan</option><option>Lainnya</option>
            </select>
          </label>
          <label htmlFor={`${prefix}-blood`}>Golongan darah
            <select id={`${prefix}-blood`} value={value.bloodType} onChange={e => update('bloodType', e.target.value)}>
              <option value="">Belum diketahui</option>
              {['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label htmlFor={`${prefix}-height`}>Tinggi badan (cm)
            <input id={`${prefix}-height`} type="number" min="0.1" max="300" step="0.1" placeholder="Contoh: 170.5" value={value.height} onChange={e => update('height', e.target.value)} />
          </label>
          <label htmlFor={`${prefix}-weight`}>Berat badan (kg)
            <input id={`${prefix}-weight`} type="number" min="0.1" max="700" step="0.1" placeholder="Contoh: 65.2" value={value.weight} onChange={e => update('weight', e.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Catatan pemeriksaan</legend>
        <p className="muted">Kosong berarti belum dicatat. Tulis “Tidak ada alergi yang diketahui” jika memang sudah diperiksa. Batas teks dihitung dalam byte UTF-8.</p>
        <div className="form-grid">
          {TEXT_FIELDS.map(([key, label, limit]) => (
            <label htmlFor={`${prefix}-${key}`} key={key}>{label}{key === 'diagnosis' ? ' *' : ''}
              <textarea id={`${prefix}-${key}`} value={value[key]} maxLength={limit} required={key === 'diagnosis'} rows={3} onChange={e => update(key, e.target.value)} />
              <small>Maks. {limit} byte</small>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="record-actions">
        <button type="submit" disabled={disabled}>{submitLabel}</button>
        {onCancel && <button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>Batal</button>}
      </div>
    </form>
  )
}
