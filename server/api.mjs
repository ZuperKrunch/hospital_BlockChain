import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getAddress, verifyMessage } from 'ethers'

const ROLE = { ADMIN: 1, DOCTOR: 2, PATIENT: 3 }
const MINUTE = 60_000
const REASONS = ['Kecelakaan', 'Pingsan / tidak sadar', 'Henti jantung', 'Stroke', 'Muntah darah', 'Lainnya']
const now = () => Date.now()
const token = () => randomBytes(32).toString('hex')
const hash = value => createHash('sha256').update(value).digest('hex')
const commitmentFor = (salt, body) => '0x' + hash(Buffer.from(salt, 'hex').toString('hex') + ':' + body)

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
function requireThat(condition, message, status = 400) {
  if (!condition) throw new ApiError(status, message)
}
function address(value) {
  try { return getAddress(value).toLowerCase() }
  catch { throw new ApiError(400, 'Alamat wallet tidak valid.') }
}
function field(value, limit, required = false) {
  requireThat(typeof (value ?? '') === 'string', 'Nilai isian harus berupa teks.')
  const clean = (value ?? '').trim()
  requireThat(clean.length <= limit && (!required || clean.length), 'Isi kolom wajib dan periksa batas panjang teks.')
  return clean
}
async function json(req) {
  requireThat(req.headers['content-type']?.split(';')[0]?.trim() === 'application/json', 'Gunakan format JSON.', 415)
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 24_000) throw new ApiError(413, 'Data terlalu besar.')
    chunks.push(chunk)
  }
  let result
  try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ApiError(400, 'JSON tidak valid.') }
  requireThat(result && typeof result === 'object' && !Array.isArray(result), 'Isi permintaan tidak valid.')
  return result
}

export function createApi({ store, chain, origin, demo, clock = now }) {
  const challenges = new Map()
  const sessions = new Map()
  let publishQueue = Promise.resolve()
  const queued = action => {
    const next = publishQueue.then(action)
    publishQueue = next.catch(() => {})
    return next
  }
  function sweep(map) { for (const [key, value] of map) if (value.expires <= clock()) map.delete(key) }
  async function currentRole(wallet) { return Number(await chain.roles(wallet)) }
  function createSession(wallet) {
    sweep(sessions)
    requireThat(sessions.size < 1000, 'Server sedang sibuk. Coba lagi.', 429)
    const key = token()
    sessions.set(hash(key), { wallet, expires: clock() + 4 * 60 * MINUTE })
    return { token: key, wallet }
  }
  async function authenticate(req) {
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1]
    const key = bearer && hash(bearer)
    const session = key && sessions.get(key)
    requireThat(session && session.expires > clock(), 'Sesi habis. Hubungkan wallet lagi.', 401)
    const role = await currentRole(session.wallet)
    return { wallet: session.wallet, role, key }
  }
  function admin(user) { requireThat(user.role === ROLE.ADMIN, 'Khusus admin.', 403) }
  const profile = wallet => store.get('SELECT * FROM profiles WHERE wallet=?', wallet)
  const appointment = id => store.get('SELECT * FROM appointments WHERE id=?', id)
  function visitView(visit) {
    const patient = profile(visit.patient)
    return {
      ...visit, patient_name: patient?.name || visit.patient, doctor_name: profile(visit.doctor)?.name || visit.doctor,
      patient_phone: visit.status === 'scheduled' && clock() >= visit.starts + 30 * MINUTE ? patient?.phone : undefined,
    }
  }
  async function doctorWindow(visit, user) {
    if (user.role !== ROLE.DOCTOR || user.wallet !== visit.doctor || !['checked_in', 'completed'].includes(visit.status)) return 'closed'
    const time = clock()
    if (time < visit.starts || time >= visit.ends + 30 * MINUTE || !await chain.authorizedDoctors(visit.patient, user.wallet)) return 'closed'
    // Recheck after the network read in case the clock or appointment status changed.
    const live = appointment(visit.id)
    if (!live || live.doctor !== user.wallet || live.patient !== visit.patient || !['checked_in', 'completed'].includes(live.status) ||
      clock() < live.starts || clock() >= live.ends + 30 * MINUTE) return 'closed'
    return live.status === 'checked_in' && clock() < live.ends ? 'history' : 'notes'
  }
  function getVersions(id) {
    return store.all('SELECT * FROM versions WHERE record=? AND confirmed=1 ORDER BY version DESC', id)
      .map(row => ({ version: row.version, body: JSON.parse(row.body), active: Boolean(row.active), created: row.created, commitment: row.commitment,
        integral: commitmentFor(row.salt, row.body) === row.commitment }))
  }
  async function reconcile(record, version) {
    const proof = await chain.proofAt(record.id, version.version)
    requireThat(proof.commitment.toLowerCase() === version.commitment && proof.active === Boolean(version.active),
      'Bukti blockchain berbeda dari versi di database.', 409)
    store.run('UPDATE versions SET confirmed=1 WHERE record=? AND version=?', record.id, version.version)
  }
  async function publish(record, version) {
    try {
      const current = await chain.proofCount(record.id)
      if (current < BigInt(version.version)) {
        if (version.tx_hash && (await chain.transactionStatus(version.tx_hash)) !== 'failed') {
          return { id: record.id, version: version.version, commitment: version.commitment, pending: true }
        }
        await chain.publish(record.id, version.version, version.commitment, Boolean(version.active), txHash =>
          store.run('UPDATE versions SET tx_hash=? WHERE record=? AND version=?', txHash, record.id, version.version))
      }
      await reconcile(record, version)
      return { id: record.id, version: version.version, commitment: version.commitment, pending: false }
    } catch (error) {
      if (error instanceof ApiError) throw error
      return { id: record.id, version: version.version, commitment: version.commitment, pending: true }
    }
  }
  function medicalBody(data) {
    return {
      complaint: field(data.complaint, 1500, true), diagnosis: field(data.diagnosis, 1500, true),
      allergies: field(data.allergies, 1000), medications: field(data.medications, 1500),
      history: field(data.history, 1500), treatment: field(data.treatment, 1500),
      height: field(data.height, 12), weight: field(data.weight, 12),
    }
  }
  function terminal(req) {
    const key = req.headers['x-terminal-token']
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null
    return store.get('SELECT * FROM terminals WHERE token_hash=? AND active=1', hash(key))
  }
  async function dispatch(req, url) {
    const { pathname: path } = url
    const method = req.method
    if (method === 'GET' && path === '/api/config') return { demo: Boolean(demo), personas: demo?.personas ?? [], contract: chain.contract, chainId: chain.chainId }
    requireThat(req.headers.origin === origin || method === 'GET' && req.headers.origin === undefined,
      'Origin aplikasi tidak diizinkan.', 403)
    if (method === 'POST' && path === '/api/auth/challenge') {
      requireThat(!demo, 'Gunakan akun demo.', 404)
      const wallet = address((await json(req)).wallet)
      sweep(challenges)
      requireThat(challenges.size < 500, 'Terlalu banyak permintaan masuk.', 429)
      const nonce = token()
      const expires = clock() + 5 * MINUTE
      const message = [
        new URL(origin).host + ' wants you to sign in with your Ethereum account:',
        getAddress(wallet), '', 'Sign in to RuangSehat. This signature does not send a transaction.', '',
        'URI: ' + origin, 'Version: 1', 'Chain ID: ' + chain.chainId,
        'Nonce: ' + nonce, 'Issued At: ' + new Date(clock()).toISOString(),
        'Expiration Time: ' + new Date(expires).toISOString(),
      ].join('\n')
      challenges.set(nonce, { wallet, message, expires })
      return { nonce, message }
    }
    if (method === 'POST' && path === '/api/auth/verify') {
      requireThat(!demo, 'Gunakan akun demo.', 404)
      const { nonce, signature } = await json(req)
      const challenge = challenges.get(nonce)
      requireThat(challenge && challenge.expires > clock(), 'Permintaan login kedaluwarsa.', 401)
      let signed
      try { signed = verifyMessage(challenge.message, signature).toLowerCase() } catch { throw new ApiError(401, 'Tanda tangan tidak valid.') }
      requireThat(signed === challenge.wallet, 'Wallet penanda tangan berbeda.', 401)
      challenges.delete(nonce)
      return createSession(challenge.wallet)
    }
    if (method === 'POST' && path === '/api/auth/demo') {
      requireThat(demo, 'Mode demo tidak tersedia.', 404)
      const { wallet } = await json(req)
      requireThat(demo.personas.some(persona => persona.wallet === wallet), 'Akun demo tidak tersedia.', 403)
      return createSession(wallet)
    }
    const user = await authenticate(req)
    if (method === 'POST' && path === '/api/auth/logout') { sessions.delete(user.key); return { ok: true } }
    if (method === 'GET' && path === '/api/me') return { wallet: user.wallet, role: user.role, profile: profile(user.wallet) ?? null }
    requireThat(user.role, 'Wallet belum mendapat role.', 403)

    if (method === 'GET' && path === '/api/doctors') {
      const items = store.all('SELECT wallet,name,specialty,clinic,bio FROM profiles WHERE specialty<>? ORDER BY name LIMIT 150', '')
      const roles = await Promise.all(items.map(item => currentRole(item.wallet)))
      return items.filter((_, index) => roles[index] === ROLE.DOCTOR)
    }
    if (method === 'GET' && path === '/api/users') {
      admin(user)
      return store.all('SELECT wallet,name,specialty,clinic,bio FROM profiles ORDER BY name LIMIT 150')
    }
    if (method === 'PUT' && path === '/api/profiles/me') {
      const data = await json(req)
      const doctor = user.role === ROLE.DOCTOR
      const patient = user.role === ROLE.PATIENT
      const birthDate = patient ? field(data.birth_date, 10) : ''
      requireThat(!birthDate || /^\d{4}-\d{2}-\d{2}$/.test(birthDate), 'Tanggal lahir tidak valid.')
      store.run(`INSERT INTO profiles(wallet,name,specialty,clinic,bio,phone,birth_date,gender) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(wallet) DO UPDATE SET name=excluded.name,specialty=excluded.specialty,clinic=excluded.clinic,
        bio=excluded.bio,phone=excluded.phone,birth_date=excluded.birth_date,gender=excluded.gender`,
        user.wallet, field(data.name, 100, true), doctor ? field(data.specialty, 90, true) : '',
        doctor ? field(data.clinic, 90) : '', doctor ? field(data.bio, 400) : '',
        patient ? field(data.phone, 40) : '', birthDate, patient ? field(data.gender, 40) : '')
      return profile(user.wallet)
    }
    if (method === 'DELETE' && path === '/api/profiles/me') {
      store.run('DELETE FROM profiles WHERE wallet=?', user.wallet)
      return { ok: true }
    }
    if (method === 'POST' && path === '/api/demo/roles') {
      requireThat(demo, 'Gunakan transaksi wallet.', 404); admin(user)
      const data = await json(req)
      const role = Number(data.role)
      requireThat([0, 2, 3].includes(role), 'Role tidak valid.')
      await demo.assignRole(address(data.wallet), role)
      return { ok: true }
    }
    if (method === 'POST' && path === '/api/demo/permissions') {
      requireThat(demo && user.role === ROLE.PATIENT, 'Pasien saja.', 403)
      const data = await json(req)
      await demo.permission(user.wallet, address(data.doctor), Boolean(data.enabled))
      return { ok: true }
    }
    if (method === 'GET' && path === '/api/permissions') {
      requireThat(user.role === ROLE.PATIENT, 'Pasien saja.', 403)
      return { enabled: await chain.authorizedDoctors(user.wallet, address(url.searchParams.get('doctor'))) }
    }

    if (path === '/api/appointments' && method === 'GET') {
      const rows = user.role === ROLE.ADMIN ? store.all('SELECT * FROM appointments ORDER BY starts DESC LIMIT 150')
        : user.role === ROLE.DOCTOR ? store.all('SELECT * FROM appointments WHERE doctor=? ORDER BY starts DESC LIMIT 150', user.wallet)
          : store.all('SELECT * FROM appointments WHERE patient=? ORDER BY starts DESC LIMIT 150', user.wallet)
      return Promise.all(rows.map(async row => {
        const view = visitView(row)
        if (user.role !== ROLE.ADMIN) delete view.patient_phone
        return { ...view, access: user.role === ROLE.DOCTOR ? await doctorWindow(row, user) : 'closed' }
      }))
    }
    if (path === '/api/appointments' && method === 'POST') {
      admin(user)
      const data = await json(req)
      const patient = address(data.patient)
      const doctor = address(data.doctor)
      const [patientRole, doctorRole] = await Promise.all([currentRole(patient), currentRole(doctor)])
      requireThat(patientRole === ROLE.PATIENT && doctorRole === ROLE.DOCTOR, 'Periksa role wallet pasien dan dokter.')
      const starts = Number(data.starts), ends = Number(data.ends)
      requireThat(Number.isSafeInteger(starts) && Number.isSafeInteger(ends) && starts >= clock() - 5 * MINUTE &&
        ends > starts && ends <= starts + 8 * 60 * MINUTE, 'Pilih rentang waktu ke depan dengan durasi maksimal 8 jam.')
      const id = randomUUID()
      store.atomic(() => {
        const conflict = store.get(`SELECT id FROM appointments WHERE (doctor=? OR patient=?) AND starts<? AND ends>? AND status IN ('scheduled','checked_in')`, doctor, patient, ends, starts)
        requireThat(!conflict, 'Jadwal bertabrakan dengan appointment lain.', 409)
        store.run('INSERT INTO appointments(id,patient,doctor,starts,ends) VALUES (?,?,?,?,?)', id, patient, doctor, starts, ends)
      })
      return visitView(appointment(id))
    }
    const visitPath = /^\/api\/appointments\/([a-f0-9-]+)$/.exec(path)
    if (visitPath && ['PATCH', 'DELETE'].includes(method)) {
      admin(user)
      const id = visitPath[1]
      const data = method === 'PATCH' ? await json(req) : {}
      return store.atomic(() => {
        const visit = appointment(id)
        requireThat(visit, 'Appointment tidak ditemukan.', 404)
        if (method === 'DELETE') {
          requireThat(['scheduled', 'cancelled'].includes(visit.status) &&
            !store.get('SELECT id FROM bills WHERE appointment=?', id) && !store.get('SELECT id FROM records WHERE appointment=?', id),
            'Appointment dengan pemeriksaan atau tagihan harus disimpan dalam riwayat.', 409)
          store.run('DELETE FROM appointments WHERE id=?', id)
          return { ok: true }
        }
        if (data.action === 'reschedule') {
          const starts = Number(data.starts), ends = Number(data.ends)
          requireThat(visit.status === 'scheduled' && Number.isSafeInteger(starts) && Number.isSafeInteger(ends) &&
            starts >= clock() - 5 * MINUTE && ends > starts && ends <= starts + 8 * 60 * MINUTE, 'Jadwal baru tidak valid.')
          requireThat(!store.get(`SELECT id FROM appointments WHERE id<>? AND (doctor=? OR patient=?) AND starts<? AND ends>? AND status IN ('scheduled','checked_in')`,
            id, visit.doctor, visit.patient, ends, starts), 'Jadwal bertabrakan.', 409)
          store.run('UPDATE appointments SET starts=?,ends=? WHERE id=?', starts, ends, id)
        } else {
          const allowed = {
            check_in: visit.status === 'scheduled' && clock() < visit.ends,
            complete: visit.status === 'checked_in' && clock() >= visit.starts,
            cancel: ['scheduled', 'checked_in'].includes(visit.status),
          }
          requireThat(Object.hasOwn(allowed, data.action) && allowed[data.action], 'Perubahan status tidak tersedia.', 409)
          const next = { check_in: 'checked_in', complete: 'completed', cancel: 'cancelled' }[data.action]
          store.run('UPDATE appointments SET status=? WHERE id=?', next, id)
        }
        return visitView(appointment(id))
      })
    }

    if (path === '/api/bills' && method === 'GET') {
      requireThat([ROLE.ADMIN, ROLE.PATIENT].includes(user.role), 'Akses tagihan dibatasi.', 403)
      return user.role === ROLE.ADMIN
        ? store.all('SELECT b.*, a.patient FROM bills b JOIN appointments a ON a.id=b.appointment ORDER BY b.updated DESC LIMIT 150')
        : store.all('SELECT b.*, a.patient FROM bills b JOIN appointments a ON a.id=b.appointment WHERE a.patient=? ORDER BY b.updated DESC LIMIT 150', user.wallet)
    }
    if (path === '/api/bills' && method === 'PUT') {
      admin(user)
      const data = await json(req)
      const visit = appointment(field(data.appointment, 36, true))
      requireThat(visit, 'Appointment tidak ditemukan.', 404)
      const amount = Number(data.amount)
      requireThat(Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000, 'Nominal rupiah tidak valid.')
      requireThat(['unpaid', 'paid', 'void'].includes(data.status), 'Status tagihan tidak valid.')
      const previous = store.get('SELECT * FROM bills WHERE appointment=?', visit.id)
      if (data.id !== undefined) requireThat(previous?.id === field(data.id, 36, true),
        'Tagihan berubah atau sudah dihapus. Muat ulang daftarnya.', 409)
      const description = field(data.description, 500, true)
      if (previous?.status === 'paid') requireThat(amount === previous.amount && description === previous.description,
        'Nominal dan rincian struk yang sudah lunas tidak bisa diubah.', 409)
      if (previous?.status === 'paid' && data.status === 'paid') return { ok: true }
      requireThat(previous?.status !== 'void' && !(previous?.status === 'paid' && data.status === 'unpaid'),
        'Perubahan status tagihan tidak tersedia.', 409)
      store.run(`INSERT INTO bills(id, appointment, description, amount, status, updated) VALUES(?,?,?,?,?,?)
        ON CONFLICT(appointment) DO UPDATE SET description=excluded.description,amount=excluded.amount,status=excluded.status,updated=excluded.updated`,
        previous?.id ?? randomUUID(), visit.id, description, amount, data.status, clock())
      return { ok: true }
    }
    const billPath = /^\/api\/bills\/([a-f0-9-]+)$/.exec(path)
    if (billPath && method === 'DELETE') {
      admin(user)
      const id = billPath[1]
      return store.atomic(() => {
        const bill = store.get('SELECT status FROM bills WHERE id=?', id)
        requireThat(bill, 'Tagihan tidak ditemukan.', 404)
        requireThat(bill.status === 'unpaid', 'Hanya tagihan yang belum dibayar yang bisa dihapus.', 409)
        store.run('DELETE FROM bills WHERE id=?', id)
        return { ok: true }
      })
    }

    if (method === 'GET' && path === '/api/records') {
      let rows, visit
      if (user.role === ROLE.PATIENT) rows = store.all('SELECT * FROM records WHERE patient=? LIMIT 100', user.wallet)
      else {
        requireThat(user.role === ROLE.DOCTOR, 'Akses rekam medis dibatasi.', 403)
        visit = appointment(url.searchParams.get('appointment') ?? '')
        const window = visit ? await doctorWindow(visit, user) : 'closed'
        requireThat(window !== 'closed', 'Akses memerlukan izin pasien serta appointment yang sudah check-in dan masih berlaku.', 403)
        rows = window === 'history' ? store.all('SELECT * FROM records WHERE patient=? LIMIT 100', visit.patient)
          : store.all('SELECT * FROM records WHERE appointment=?', visit.id)
      }
      const pendingFor = record => store.get('SELECT * FROM versions WHERE record=? AND confirmed=0', record.id)
      for (const record of rows) {
        const pending = pendingFor(record)
        if (!pending) continue
        try {
          if (await chain.proofCount(record.id) >= BigInt(pending.version)) await reconcile(record, pending)
        } catch {
          // Pending versions remain private until a matching proof can be checked.
        }
      }
      if (visit) {
        const scope = await doctorWindow(visit, user)
        requireThat(scope !== 'closed', 'Izin atau waktu appointment tidak berlaku.', 403)
        if (scope === 'notes') rows = rows.filter(record => record.appointment === visit.id)
      }
      return rows.map(record => ({
        ...record, versions: getVersions(record.id),
        pending: user.wallet === record.doctor && Boolean(pendingFor(record)),
      })).filter(record => record.versions.length || record.pending)
    }
    if (method === 'POST' && path === '/api/records') {
      const data = await json(req)
      return queued(async () => {
        const visit = appointment(field(data.appointment, 36, true))
        requireThat(visit && await doctorWindow(visit, user) !== 'closed', 'Izin atau waktu appointment tidak berlaku.', 403)
        let record = store.get('SELECT * FROM records WHERE appointment=?', visit.id)
        if (record) {
          const pending = store.get('SELECT * FROM versions WHERE record=? AND confirmed=0', record.id)
          if (pending) {
            requireThat(data.action === 'sync', 'Sinkronkan versi tertunda sebelum membuat perubahan baru.', 409)
            return publish(record, pending)
          }
        }
        requireThat(data.action !== 'sync', 'Tidak ada versi yang menunggu sinkronisasi.', 409)
        const versions = record ? getVersions(record.id) : []
        const latest = versions[0]
        requireThat(!latest || latest.active, 'Record sudah dinonaktifkan.', 409)
        const inactive = data.action === 'deactivate'
        requireThat(!inactive || latest, 'Pemeriksaan belum ada.')
        requireThat(Number(data.expected_version ?? 0) === (latest?.version ?? 0), 'Versi sudah berubah. Muat ulang record.', 409)
        const payload = inactive ? { reason: field(data.reason, 400, true) }
          : { ...medicalBody(data), reason: latest ? field(data.reason, 400, true) : '' }
        const salt = token()
        const body = JSON.stringify(payload)
        const version = { version: (latest?.version ?? 0) + 1, commitment: commitmentFor(salt, body), active: !inactive }
        store.atomic(() => {
          if (!record) {
            record = { id: '0x' + token(), appointment: visit.id, patient: visit.patient, doctor: user.wallet }
            store.run('INSERT INTO records(id,appointment,patient,doctor) VALUES(?,?,?,?)', record.id, visit.id, visit.patient, user.wallet)
          }
          store.run('INSERT INTO versions(record,version,body,salt,commitment,active,created) VALUES(?,?,?,?,?,?,?)',
            record.id, version.version, body, salt, version.commitment, Number(version.active), clock())
        })
        return publish(record, version)
      })
    }

    if (method === 'GET' && path === '/api/terminal') {
      const current = terminal(req)
      return { enrolled: Boolean(current), name: current?.name }
    }
    if (method === 'POST' && path === '/api/terminal') {
      admin(user)
      const name = field((await json(req)).name, 80, true)
      const secret = token()
      store.run('INSERT INTO terminals(token_hash,name) VALUES (?,?)', hash(secret), name)
      return { token: secret, name }
    }
    if (method === 'DELETE' && path === '/api/terminal') {
      admin(user)
      const current = terminal(req)
      requireThat(current, 'Terminal belum terdaftar.', 404)
      store.run('UPDATE terminals SET active=0 WHERE token_hash=?', current.token_hash)
      return { ok: true }
    }
    if (method === 'GET' && path === '/api/emergencies') {
      const projection = 'id,patient,actor,reason,starts,ends,closed,report'
      return user.role === ROLE.ADMIN ? store.all('SELECT ' + projection + ' FROM emergencies ORDER BY starts DESC LIMIT 80')
        : store.all('SELECT ' + projection + ' FROM emergencies WHERE patient=? OR actor=? ORDER BY starts DESC LIMIT 80', user.wallet, user.wallet)
    }
    if (method === 'POST' && path === '/api/emergencies') {
      requireThat([ROLE.ADMIN, ROLE.DOCTOR].includes(user.role), 'Khusus petugas.', 403)
      const data = await json(req)
      const device = terminal(req)
      requireThat(device, 'Daftarkan terminal IGD melalui admin.', 403)
      const patient = address(data.patient)
      requireThat(await currentRole(patient) === ROLE.PATIENT && REASONS.includes(data.reason), 'Pasien atau alasan tidak valid.')
      const id = randomUUID(), starts = clock()
      store.atomic(() => {
        requireThat(!store.get('SELECT id FROM emergencies WHERE patient=? AND actor=? AND closed IS NULL AND ends>?', patient, user.wallet, starts),
          'Akses darurat untuk pasien ini masih aktif.', 409)
        store.run('INSERT INTO emergencies(id,patient,actor,terminal,reason,starts,ends) VALUES(?,?,?,?,?,?,?)',
          id, patient, user.wallet, device.token_hash, data.reason, starts, starts + 30 * MINUTE)
      })
      return { id }
    }
    const emergencyPath = /^\/api\/emergencies\/([a-f0-9-]+)\/(summary|close|report)$/.exec(path)
    if (emergencyPath) {
      const event = store.get('SELECT * FROM emergencies WHERE id=?', emergencyPath[1])
      requireThat(event, 'Aktivasi tidak ditemukan.', 404)
      const action = emergencyPath[2]
      requireThat(user.wallet === event.actor && [ROLE.ADMIN, ROLE.DOCTOR].includes(user.role), 'Akses khusus petugas yang mengaktifkan.', 403)
      if (method === 'GET' && action === 'summary') {
        requireThat(!event.closed && event.ends > clock() && terminal(req)?.token_hash === event.terminal &&
          await currentRole(event.patient) === ROLE.PATIENT, 'Akses darurat sudah berakhir atau terminal tidak sesuai.', 403)
        const updated = store.get('SELECT closed,ends FROM emergencies WHERE id=?', event.id)
        requireThat(!updated.closed && updated.ends > clock() && terminal(req)?.token_hash === event.terminal, 'Akses darurat sudah berakhir.', 403)
        const recent = store.get(`SELECT v.body FROM records r JOIN versions v ON v.record=r.id
          WHERE r.patient=? AND v.confirmed=1 AND v.active=1 AND v.version=(SELECT MAX(latest.version)
          FROM versions latest WHERE latest.record=r.id AND latest.confirmed=1) ORDER BY v.created DESC LIMIT 1`, event.patient)
        const { height, weight, allergies, medications, history } = recent ? JSON.parse(recent.body) : {}
        const p = profile(event.patient)
        return { name: p?.name, gender: p?.gender, height, weight, allergies, medications, history, ends: event.ends }
      }
      if (method === 'POST' && action === 'close') {
        store.run('UPDATE emergencies SET closed=? WHERE id=? AND closed IS NULL', clock(), event.id)
        return { ok: true }
      }
      if (method === 'POST' && action === 'report') {
        requireThat(event.reason === 'Lainnya' && (event.closed || event.ends <= clock()) && !event.report, 'Laporan tidak tersedia.', 409)
        store.run('UPDATE emergencies SET report=? WHERE id=? AND report=?', field((await json(req)).report, 1200, true), event.id, '')
        return { ok: true }
      }
    }
    throw new ApiError(404, 'Fitur tidak ditemukan.')
  }
  return async (req, res) => {
    if (req.headers.origin === origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method === 'OPTIONS') {
      res.writeHead(req.headers.origin === origin ? 204 : 403, {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Terminal-Token',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      })
      return res.end()
    }
    try {
      const result = await dispatch(req, new URL(req.url, origin))
      res.writeHead(result?.pending ? 202 : 200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(error.status || 503, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: error.status ? error.message : 'Layanan sedang tidak tersedia. Coba lagi.' }))
    }
  }
}
