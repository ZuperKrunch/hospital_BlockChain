import { visitStatus } from './format'

export function Icon({ name, className = '' }) {
  const paths = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    calendar: 'M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4 M8 13h2 M14 13h2 M8 17h2',
    file: 'M6 3h8l4 4v14H6z M14 3v5h5 M9 12h6 M9 16h6',
    people: 'M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M21 20v-2a4 4 0 0 0-3-4 M17 4a4 4 0 0 1 0 8',
    shield: 'M12 22s7-3.5 7-10V5l-7-3-7 3v7c0 6.5 7 10 7 10z M9 12l2 2 4-4',
    wallet: 'M4 5h15v14H4z M4 8h15 M15 12h6v4h-6z',
    cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    user: 'M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
    logout: 'M10 5H4v14h6 M9 12h11m-4-4 4 4-4 4',
  }
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.grid} /></svg>
}
export function Brand() { return <div className="brand"><span><Icon name="cross" /></span>RuangSehat</div> }
export function Panel({ title, description, actions, children, className = '' }) {
  return <section className={'panel ' + className}>
    {(title || actions) && <div className="panel-head"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</div>}
    {children}
  </section>
}
export function Empty({ title, children, icon = 'file' }) {
  return <div className="empty"><span><Icon name={icon} /></span><strong>{title}</strong>{children && <p>{children}</p>}</div>
}
export function Feedback({ error, message }) {
  return error ? <p className="feedback error" role="alert">{error}</p> : message ? <p className="feedback" role="status">{message}</p> : null
}
export function Pill({ children, tone = 'mint' }) { return <span className={'pill ' + tone}>{children}</span> }
export function VisitStatus({ visit }) {
  const [label, tone] = visitStatus(visit) ?? ['—', 'blue']
  return <Pill tone={visit.patient_phone ? 'amber' : tone}>{visit.patient_phone ? 'Perlu dihubungi' : label}</Pill>
}
export function Field({ label, value, onChange, type = 'text', required, maxLength, options, placeholder, min, className, disabled }) {
  return <label className={className}><span>{label}</span>{
    options ? <select value={value} onChange={e => onChange(e.target.value)} required={required} disabled={disabled}>{options.map(option =>
      <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    : type === 'textarea' ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} required={required} maxLength={maxLength} placeholder={placeholder} disabled={disabled} />
    : <input value={value} onChange={e => onChange(e.target.value)} type={type} required={required} maxLength={maxLength} placeholder={placeholder} min={min} disabled={disabled} />
  }</label>
}
