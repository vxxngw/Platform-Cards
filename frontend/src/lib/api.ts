// Backend base. Same-origin `<BASE_URL>api/…` by default; set VITE_API_URL (e.g. https://my-backend.onrender.com) when the
// backend is hosted elsewhere, as on Vercel where only the frontend is deployed.
const API_URL = ((import.meta.env as Record<string, string | undefined>).VITE_API_URL || '').replace(/\/+$/, '')

export function api(path: string) {
  const p = `api/${path.replace(/^\/+/, '')}`
  return API_URL ? `${API_URL}/${p}` : `${import.meta.env.BASE_URL}${p}`
}
