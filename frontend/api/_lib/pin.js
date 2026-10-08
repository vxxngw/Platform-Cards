// POST /api/pin — publishes the metadata folder of a Pack Builder set.
//
// Only an ADMIN wallet may use it: the browser signs `pinMessage(sha256(filesJson), timestamp)` with personal_sign and the
// server checks the signer holds ADMIN_ROLE on CardCollection (or is in ADMIN_ADDRESSES). The Pinata JWT never leaves the server.
// The files are pinned to IPFS (Pinata) as one directory and the directory CID is returned; without PINATA_JWT it answers 503.
import crypto from 'node:crypto'
import express, { Router } from 'express'
import { createPublicClient, http, keccak256, recoverMessageAddress, toBytes } from 'viem'

const MAX_SKEW_MS = 5 * 60 * 1000
const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_FILES = 2000
const MAX_FILE_BYTES = 20 * 1024
const RATE_LIMIT = { max: 30, windowMs: 3600 * 1000 }
const ADMIN_ROLE = keccak256(toBytes('ADMIN_ROLE'))
const HAS_ROLE_ABI = [{ type: 'function', name: 'hasRole', stateMutability: 'view', inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], outputs: [{ type: 'bool' }] }]

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex')
const pinMessage = (hash, timestamp) => `CARDRA — pin metadata\nsha256: ${hash}\ntimestamp: ${timestamp}`

/** Validates the signed JSON string and returns [[filename, jsonText], …]. */
function parseFiles(filesJson) {
  let obj
  try { obj = JSON.parse(filesJson) } catch { throw new HttpError(400, 'filesJson is not valid JSON') }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new HttpError(400, 'filesJson must be an object {"<id>.json": {...}}')
  const names = Object.keys(obj)
  if (names.length === 0) throw new HttpError(400, 'There are no files to pin')
  if (names.length > MAX_FILES) throw new HttpError(413, `At most ${MAX_FILES} files`)
  return names.map((name) => {
    if (!/^[1-9]\d{0,8}\.json$/.test(name)) throw new HttpError(400, `Invalid file name: ${name.slice(0, 30)}`)
    const v = obj[name]
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `${name} must be a JSON object`)
    const text = JSON.stringify(v)
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new HttpError(413, `${name} is larger than ${MAX_FILE_BYTES} bytes`)
    return [name, text]
  })
}

/** Throws HttpError unless `body` is a fresh, correctly signed request from an admin. */
async function verifyPinRequest(body, { now = Date.now(), isAdmin }) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body')
  const { address, signature, timestamp, filesJson } = body
  if (typeof filesJson !== 'string' || typeof signature !== 'string' || typeof address !== 'string') throw new HttpError(400, 'Missing address/signature/filesJson')
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) throw new HttpError(401, 'The signature expired, please sign again')
  let signer
  try {
    signer = await recoverMessageAddress({ message: pinMessage(sha256Hex(filesJson), ts), signature })
  } catch {
    throw new HttpError(401, 'Invalid signature')
  }
  if (signer.toLowerCase() !== address.toLowerCase()) throw new HttpError(401, 'The signature does not match the wallet address')
  if (!(await isAdmin(signer))) throw new HttpError(403, 'This wallet is not an admin')
  return { address: signer, files: parseFiles(filesJson) }
}

/** ADMIN_ADDRESSES (comma separated) wins; otherwise hasRole(ADMIN_ROLE) on COLLECTION_ADDRESS via CHAIN_RPC_URL. */
function makeIsAdmin(env = process.env, makeClient = (url) => createPublicClient({ transport: http(url) })) {
  const list = String(env.ADMIN_ADDRESSES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (list.length) return async (addr) => list.includes(String(addr).toLowerCase())
  if (env.COLLECTION_ADDRESS) {
    const client = makeClient(env.CHAIN_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com')
    return async (addr) => client.readContract({ address: env.COLLECTION_ADDRESS, abi: HAS_ROLE_ABI, functionName: 'hasRole', args: [ADMIN_ROLE, addr] })
  }
  return null
}

/** One IPFS directory holding `<id>.json` files; the returned CID is the directory (so `ipfs://<cid>/<id>.json` resolves). */
async function pinDirectory(files, { jwt, apiUrl = 'https://api.pinata.cloud', fetchImpl = fetch, name = 'tcg-metadata' }) {
  const form = new FormData()
  for (const [fname, text] of files) form.append('file', new Blob([text], { type: 'application/json' }), `metadata/${fname}`)
  form.append('pinataMetadata', JSON.stringify({ name }))
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))
  const r = await fetchImpl(`${apiUrl}/pinning/pinFileToIPFS`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new HttpError(502, `Pinata answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const j = await r.json()
  if (!j?.IpfsHash) throw new HttpError(502, 'Pinata returned no IpfsHash')
  return j.IpfsHash
}

function createPinRouter({ isAdmin, env = process.env, fetchImpl = fetch, now = () => Date.now() }) {
  const router = Router()
  const hits = new Map()
  const limited = (ip) => {
    const t = now()
    const arr = (hits.get(ip) || []).filter((x) => t - x < RATE_LIMIT.windowMs)
    arr.push(t)
    hits.set(ip, arr)
    return arr.length > RATE_LIMIT.max
  }
  const mode = () => (env.PINATA_JWT ? 'pinata' : 'unconfigured')

  router.get('/', (_req, res) => {
    res.json({ mode: mode(), authConfigured: !!isAdmin, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES })
  })

  // text/plain on purpose: a metadata folder can be far larger than the default 100 kB express.json() limit.
  router.post('/', express.text({ type: () => true, limit: MAX_BODY_BYTES }), async (req, res) => {
    try {
      if (!isAdmin) throw new HttpError(503, 'The server has no ADMIN_ADDRESSES or COLLECTION_ADDRESS, so it cannot verify admins')
      if (mode() !== 'pinata') throw new HttpError(503, 'The server has no PINATA_JWT, so it cannot pin metadata to IPFS')
      if (limited(req.ip)) throw new HttpError(429, 'Too many pin requests, try again later')
      let body
      try { body = JSON.parse(typeof req.body === 'string' ? req.body : '') } catch { throw new HttpError(400, 'The body must be JSON') }
      const { files } = await verifyPinRequest(body, { now: now(), isAdmin })

      const cid = await pinDirectory(files, { jwt: env.PINATA_JWT, apiUrl: env.PINATA_API_URL, fetchImpl, name: `tcg-metadata-${now()}` })
      res.json({ mode: 'pinata', cid, baseUri: `ipfs://${cid}/`, count: files.length })
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
      if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'The body is too large' })
      console.error('[pin]', e)
      res.status(500).json({ error: 'Server error: ' + String(e?.message || e) })
    }
  })
  return router
}

export { createPinRouter, verifyPinRequest, makeIsAdmin, pinDirectory, parseFiles, pinMessage, sha256Hex, HttpError, ADMIN_ROLE, MAX_SKEW_MS }
