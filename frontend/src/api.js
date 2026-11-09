const BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* non-JSON error body */
    }
    const error = new Error(detail)
    error.status = res.status
    throw error
  }
  return res.json()
}

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const getStatus = () => request('/api/status')
export const getSamples = () => request('/api/samples')
export const loadModel = () => request('/api/load', { method: 'POST' })
export const synthesize = (text, speed) => request('/api/tts', json({ text, speed }))
export const phonemize = (text) => request('/api/phonemize', json({ text }))
export const audioUrl = (path) => `${BASE}${path}`
