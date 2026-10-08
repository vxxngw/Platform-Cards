// The /api serverless functions (frontend/api) are served from the same origin as the page.
export function api(path: string) {
  return `${import.meta.env.BASE_URL}api/${path.replace(/^\/+/, '')}`
}
