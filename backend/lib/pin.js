// POST /api/pin — publishes the metadata folder of a Pack Builder set.
//
// Only an ADMIN wallet may use it: the browser signs `pinMessage(sha256(filesJson), timestamp)` with personal_sign and the
// server checks the signer holds ADMIN_ROLE on CardCollection (or is in ADMIN_ADDRESSES). The Pinata JWT never leaves the server.
//   PINATA_JWT          → files are pinned to IPFS as one directory, the directory CID is returned
//   (no PINATA_JWT)     → files are stored in the app database and served by GET /api/metadata/<id>.json
const crypto = require('crypto')
const express = require('express')
const { Router } = express
const { createPublicClient, http, keccak256, recoverMessageAddress, toBytes } = require('viem')

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
const pinMessage = (hash, timestamp) => `Sàn Thẻ Bộ — pin metadata\nsha256: ${hash}\ntimestamp: ${timestamp}`

/** Validates the signed JSON string and returns [[filename, jsonText], …]. */
function parseFiles(filesJson) {
  let obj
  try { obj = JSON.parse(filesJson) } catch { throw new HttpError(400, 'filesJson không phải JSON hợp lệ') }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new HttpError(400, 'filesJson phải là object {"<id>.json": {...}}')
  const names = Object.keys(obj)
  if (names.length === 0) throw new HttpError(400, 'Không có file nào để pin')
  if (names.length > MAX_FILES) throw new HttpError(413, `Tối đa ${MAX_FILES} file`)
  return names.map((name) => {
    if (!/^[1-9]\d{0,8}\.json$/.test(name)) throw new HttpError(400, `Tên file không hợp lệ: ${name.slice(0, 30)}`)
    const v = obj[name]
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `${name} phải là object JSON`)
    const text = JSON.stringify(v)
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new HttpError(413, `${name} lớn hơn ${MAX_FILE_BYTES} byte`)
    return [name, text]
  })
}

/** Throws HttpError unless `body` is a fresh, correctly signed request from an admin. */
async function verifyPinRequest(body, { now = Date.now(), isAdmin }) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Body không hợp lệ')
  const { address, signature, timestamp, filesJson } = body
  if (typeof filesJson !== 'string' || typeof signature !== 'string' || typeof address !== 'string') throw new HttpError(400, 'Thiếu address/signature/filesJson')
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) throw new HttpError(401, 'Chữ ký đã hết hạn, hãy ký lại')
  let signer
  try {
    signer = await recoverMessageAddress({ message: pinMessage(sha256Hex(filesJson), ts), signature })
  } catch {
    throw new HttpError(401, 'Chữ ký không hợp lệ')
  }
  if (signer.toLowerCase() !== address.toLowerCase()) throw new HttpError(401, 'Chữ ký không khớp địa chỉ ví')
  if (!(await isAdmin(signer))) throw new HttpError(403, 'Ví này không có quyền Admin')
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
  if (!r.ok) throw new HttpError(502, `Pinata trả về ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  const j = await r.json()
  if (!j?.IpfsHash) throw new HttpError(502, 'Pinata không trả về IpfsHash')
  return j.IpfsHash
}

/** Fallback store when there is no Pinata JWT: rows in tc_metadata, served by routes/metadata.js. */
async function storeInDb(q, files) {
  for (let i = 0; i < files.length; i += 100) {
    const chunk = files.slice(i, i + 100)
    const params = []
    const values = chunk.map(([name, text], k) => {
      params.push(Number(name.replace('.json', '')), text)
      return `($${k * 2 + 1}, $${k * 2 + 2}::jsonb, NOW())`
    })
    await q(`INSERT INTO tc_metadata (id, data, updated_at) VALUES ${values.join(',')} ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`, params)
  }
}

function createPinRouter({ isAdmin, q, env = process.env, fetchImpl = fetch, now = () => Date.now() }) {
  const router = Router()
  const hits = new Map()
  const limited = (ip) => {
    const t = now()
    const arr = (hits.get(ip) || []).filter((x) => t - x < RATE_LIMIT.windowMs)
    arr.push(t)
    hits.set(ip, arr)
    return arr.length > RATE_LIMIT.max
  }
  const mode = () => (env.PINATA_JWT ? 'pinata' : 'server')

  router.get('/', (_req, res) => {
    res.json({ mode: mode(), authConfigured: !!isAdmin, maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES })
  })

  // text/plain on purpose: the SDK's global express.json() caps bodies at 100 kB and skips other content types.
  router.post('/', express.text({ type: () => true, limit: MAX_BODY_BYTES }), async (req, res) => {
    try {
      if (!isAdmin) throw new HttpError(503, 'Server chưa cấu hình ADMIN_ADDRESSES hoặc COLLECTION_ADDRESS nên chưa thể xác thực Admin')
      if (limited(req.ip)) throw new HttpError(429, 'Gửi quá nhiều yêu cầu pin, thử lại sau')
      let body
      try { body = JSON.parse(typeof req.body === 'string' ? req.body : '') } catch { throw new HttpError(400, 'Body phải là JSON') }
      const { files } = await verifyPinRequest(body, { now: now(), isAdmin })

      if (mode() === 'pinata') {
        const cid = await pinDirectory(files, { jwt: env.PINATA_JWT, apiUrl: env.PINATA_API_URL, fetchImpl, name: `tcg-metadata-${now()}` })
        return res.json({ mode: 'pinata', cid, baseUri: `ipfs://${cid}/`, count: files.length })
      }
      await storeInDb(q, files)
      res.json({ mode: 'server', count: files.length })
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
      if (e?.type === 'entity.too.large') return res.status(413).json({ error: 'Body quá lớn' })
      console.error('[pin]', e)
      res.status(500).json({ error: 'Lỗi máy chủ: ' + String(e?.message || e) })
    }
  })
  return router
}

module.exports = { createPinRouter, verifyPinRequest, makeIsAdmin, pinDirectory, storeInDb, parseFiles, pinMessage, sha256Hex, HttpError, ADMIN_ROLE, MAX_SKEW_MS }
