export const W = { admin: 1, doctor: 2, patient: 3 }
export const roles = ['Belum terdaftar', 'Admin', 'Dokter', 'Pasien']
export const fmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
export const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
const minute = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const asInput = time => day.format(time) + 'T' + minute.format(time)
export const parseWib = value => new Date(value + ':00+07:00').getTime()
export const rupiah = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
export const short = value => value ? value.slice(0, 6) + '…' + value.slice(-4) : '—'

export const visitStatus = v => ({ scheduled: ['Terjadwal', 'blue'], checked_in: ['Sudah check-in', 'mint'], completed: ['Selesai', 'mint'], cancelled: ['Dibatalkan', 'rose'] })[v.status]
