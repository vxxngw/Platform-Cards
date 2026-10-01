import { api } from '../api'
import { sha256Hex } from '../tc'

// Must stay identical to pinMessage() in api/_lib/pin.js (both sides have a test with the same literal).
export const pinMessage = (sha256: string, timestamp: number) => `Platform Cards — pin metadata\nsha256: ${sha256}\ntimestamp: ${timestamp}`

export type PinStatus = { mode: 'pinata' | 'unconfigured'; authConfigured: boolean }
export type PinResult = { mode: 'pinata'; count: number; baseUri: string; cid: string }

export async function pinStatus(): Promise<PinStatus | null> {
  try {
    const r = await fetch(api('pin'), { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = await r.json()
    return j?.mode ? { mode: j.mode, authConfigured: !!j.authConfigured } : null
  } catch {
    return null
  }
}

/**
 * Sends the metadata folder to /api/pin. The body is text/plain (a metadata folder can exceed the default 100 kB JSON body limit) and is
 * authenticated by a personal_sign over the SHA-256 of the exact `filesJson` string, so only an ADMIN wallet can pin.
 */
export async function pinMetadata(files: Record<string, unknown>, address: string, sign: (message: string) => Promise<string>): Promise<PinResult> {
  const filesJson = JSON.stringify(files)
  const timestamp = Date.now()
  const signature = await sign(pinMessage(await sha256Hex(filesJson), timestamp))
  const r = await fetch(api('pin'), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ address, signature, timestamp, filesJson }),
    signal: AbortSignal.timeout(90_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `Pinning failed (${r.status})`)
  return { mode: 'pinata', count: j.count, cid: j.cid, baseUri: j.baseUri }
}
