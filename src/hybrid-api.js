const endpoint = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')

export async function request(path, { token, terminal, method = 'GET', body, signal } = {}) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (terminal) headers['X-Terminal-Token'] = terminal
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(endpoint + '/api' + path, {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let result
  try { result = await response.json() }
  catch { throw new Error('API RuangSehat belum terhubung. Pastikan backend sudah berjalan.') }
  if (!response.ok) throw Object.assign(new Error(result.error || 'Permintaan gagal.'), { status: response.status })
  return result
}
