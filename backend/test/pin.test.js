const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts')
const P = require('../lib/pin')

const admin = privateKeyToAccount(generatePrivateKey())
const stranger = privateKeyToAccount(generatePrivateKey())
const isAdmin = async (a) => a.toLowerCase() === admin.address.toLowerCase()

const card = (id) => ({ name: `Card ${id}`, description: 'x', attributes: [{ trait_type: 'Tier', value: 'Common' }], source: 'tcgdex' })
const files = (from, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${from + i}.json`, card(from + i)]))

async function signedBody(filesObj, account, { ts = Date.now(), claim } = {}) {
  const filesJson = JSON.stringify(filesObj)
  const signature = await account.signMessage({ message: P.pinMessage(P.sha256Hex(filesJson), ts) })
  return JSON.stringify({ address: claim ?? account.address, signature, timestamp: ts, filesJson })
}

async function serve(router) {
  const app = express()
  app.use(express.json()) // same as the SDK: 100 kB default cap, JSON content types only
  app.use('/api/pin', router)
  const server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/api/pin`
  return { base, close: () => new Promise((r) => server.close(r)) }
}
const post = (base, body) => fetch(base, { method: 'POST', headers: { 'content-type': 'text/plain' }, body })

test('makeIsAdmin: allow-list wins, hasRole is read from the collection otherwise, nothing configured → null', async () => {
  assert.equal(P.makeIsAdmin({}), null)
  const list = P.makeIsAdmin({ ADMIN_ADDRESSES: ` ${admin.address.toLowerCase()} ,0x0000000000000000000000000000000000000001` })
  assert.equal(await list(admin.address), true)
  assert.equal(await list(stranger.address), false)

  let call
  const chain = P.makeIsAdmin({ COLLECTION_ADDRESS: '0x00000000000000000000000000000000000000aa' }, () => ({
    readContract: async (c) => { call = c; return c.args[1] === admin.address },
  }))
  assert.equal(await chain(admin.address), true)
  assert.equal(await chain(stranger.address), false)
  assert.equal(call.functionName, 'hasRole')
  assert.equal(call.args[0], P.ADMIN_ROLE)
})

test('verifyPinRequest accepts a fresh admin signature', async () => {
  const body = JSON.parse(await signedBody(files(1, 3), admin))
  const out = await P.verifyPinRequest(body, { isAdmin })
  assert.equal(out.address, admin.address)
  assert.deepEqual(out.files.map(([n]) => n), ['1.json', '2.json', '3.json'])
})

test('verifyPinRequest rejects stale, forged, tampered and non-admin requests', async () => {
  const status = async (body, now) => { try { await P.verifyPinRequest(body, { isAdmin, now }); return 200 } catch (e) { return e.status } }
  const good = JSON.parse(await signedBody(files(1, 2), admin))

  assert.equal(await status(good), 200)
  assert.equal(await status(good, Date.now() + P.MAX_SKEW_MS + 1000), 401, 'expired')
  assert.equal(await status({ ...good, filesJson: JSON.stringify(files(1, 3)) }), 401, 'content changed after signing')
  assert.equal(await status({ ...good, signature: '0x1234' }), 401, 'garbage signature')
  assert.equal(await status(JSON.parse(await signedBody(files(1, 2), admin, { claim: stranger.address }))), 401, 'claims another address')
  assert.equal(await status(JSON.parse(await signedBody(files(1, 2), stranger))), 403, 'valid signature but not an admin')
  assert.equal(await status({ ...good, timestamp: 'x' }), 401)
  assert.equal(await status({ address: 1 }), 400)
  assert.equal(await status(null), 400)
})

test('parseFiles enforces names, object values and size caps', () => {
  const bad = (obj) => { try { P.parseFiles(JSON.stringify(obj)); return 200 } catch (e) { return e.status } }
  assert.equal(bad({ '1.json': {} }), 200)
  assert.equal(bad({}), 400)
  assert.equal(bad({ '../x.json': {} }), 400)
  assert.equal(bad({ '0.json': {} }), 400)
  assert.equal(bad({ 'a.json': {} }), 400)
  assert.equal(bad({ '1.json': [] }), 400)
  assert.equal(bad({ '1.json': 'str' }), 400)
  assert.equal(bad({ '1.json': { big: 'x'.repeat(21 * 1024) } }), 413)
  assert.equal(bad(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`${i + 1}.json`, {}]))), 413)
  assert.throws(() => P.parseFiles('not json'), (e) => e.status === 400)
})

test('router (server mode): GET reports the mode; POST stores rows and needs no Pinata', async () => {
  const rows = []
  const q = async (sql, params) => { rows.push({ sql, params }); return [] }
  const s = await serve(P.createPinRouter({ isAdmin, q, env: {} }))
  try {
    assert.deepEqual(await (await fetch(s.base)).json(), { mode: 'server', authConfigured: true, maxFiles: 2000, maxFileBytes: 20480 })
    const r = await post(s.base, await signedBody(files(25, 12), admin))
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { mode: 'server', count: 12 })
    assert.equal(rows.length, 1)
    assert.match(rows[0].sql, /INSERT INTO tc_metadata .* ON CONFLICT \(id\) DO UPDATE/)
    assert.equal(rows[0].params.length, 24)
    assert.equal(rows[0].params[0], 25)
    assert.equal(JSON.parse(rows[0].params[1]).name, 'Card 25')
  } finally { await s.close() }
})

test('router accepts bodies far above the SDK 100 kB JSON cap (text/plain)', async () => {
  const s = await serve(P.createPinRouter({ isAdmin, q: async () => [], env: {} }))
  try {
    const big = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`${i + 1}.json`, { ...card(i + 1), pad: 'p'.repeat(3000) }]))
    const body = await signedBody(big, admin)
    assert.ok(body.length > 200 * 1024)
    const r = await post(s.base, body)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).count, 80)
  } finally { await s.close() }
})

test('router errors: 401 / 403 / 400 / 503 / 429', async () => {
  const s = await serve(P.createPinRouter({ isAdmin, q: async () => [], env: {} }))
  try {
    assert.equal((await post(s.base, await signedBody(files(1, 1), stranger))).status, 403)
    assert.equal((await post(s.base, await signedBody(files(1, 1), admin, { ts: Date.now() - 3600_000 }))).status, 401)
    assert.equal((await post(s.base, 'not json')).status, 400)
    assert.equal((await post(s.base, await signedBody({ 'x.json': {} }, admin))).status, 400)
  } finally { await s.close() }

  const off = await serve(P.createPinRouter({ isAdmin: null, q: async () => [], env: {} }))
  try {
    assert.equal((await fetch(off.base)).status, 200)
    const r = await post(off.base, await signedBody(files(1, 1), admin))
    assert.equal(r.status, 503)
    assert.match((await r.json()).error, /ADMIN_ADDRESSES|COLLECTION_ADDRESS/)
  } finally { await off.close() }

  const lim = await serve(P.createPinRouter({ isAdmin, q: async () => [], env: {} }))
  try {
    const codes = []
    for (let i = 0; i < 32; i++) codes.push((await post(lim.base, 'x')).status)
    assert.equal(codes[0], 400)
    assert.equal(codes.at(-1), 429)
  } finally { await lim.close() }
})

test('router (pinata mode): uploads one directory and returns its CID as ipfs:// base URI', async () => {
  let seen
  const fetchImpl = async (url, init) => {
    const entries = [...init.body.entries()]
    seen = { url, auth: init.headers.Authorization, files: entries.filter(([k]) => k === 'file').map(([, f]) => f.name), meta: JSON.parse(entries.find(([k]) => k === 'pinataMetadata')[1]), options: JSON.parse(entries.find(([k]) => k === 'pinataOptions')[1]) }
    return { ok: true, json: async () => ({ IpfsHash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' }) }
  }
  const s = await serve(P.createPinRouter({ isAdmin, q: async () => { throw new Error('db must not be used') }, env: { PINATA_JWT: 'jwt-123' }, fetchImpl }))
  try {
    assert.equal((await (await fetch(s.base)).json()).mode, 'pinata')
    const r = await post(s.base, await signedBody(files(25, 12), admin))
    assert.equal(r.status, 200)
    const out = await r.json()
    assert.equal(out.mode, 'pinata')
    assert.equal(out.baseUri, 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/')
    assert.equal(seen.url, 'https://api.pinata.cloud/pinning/pinFileToIPFS')
    assert.equal(seen.auth, 'Bearer jwt-123')
    assert.equal(seen.files.length, 12)
    assert.equal(seen.files[0], 'metadata/25.json')
    assert.equal(seen.options.cidVersion, 1)
    assert.match(seen.meta.name, /^tcg-metadata-/)
  } finally { await s.close() }
})

test('pinDirectory sends a real multipart body whose file names keep the directory prefix', async () => {
  let raw, auth
  const fake = http.createServer((req, res) => {
    auth = req.headers.authorization
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { raw = Buffer.concat(chunks).toString('utf8'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ IpfsHash: 'bafyTEST', PinSize: 1, Timestamp: 'now' })) })
  })
  await new Promise((r) => fake.listen(0, '127.0.0.1', r))
  try {
    const cid = await P.pinDirectory([['25.json', '{"a":1}'], ['26.json', '{"a":2}']], { jwt: 'tok', apiUrl: `http://127.0.0.1:${fake.address().port}` })
    assert.equal(cid, 'bafyTEST')
    assert.equal(auth, 'Bearer tok')
    assert.match(raw, /name="file"; filename="metadata\/25\.json"/)
    assert.match(raw, /name="file"; filename="metadata\/26\.json"/)
    assert.match(raw, /name="pinataOptions"/)
    assert.ok(raw.includes('{"a":2}'))
  } finally { await new Promise((r) => fake.close(r)) }
})

test('pinDirectory turns Pinata failures into 502', async () => {
  const bad = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })
  await assert.rejects(() => P.pinDirectory([['1.json', '{}']], { jwt: 'x', fetchImpl: bad }), (e) => e.status === 502 && /401/.test(e.message))
  const noHash = async () => ({ ok: true, json: async () => ({}) })
  await assert.rejects(() => P.pinDirectory([['1.json', '{}']], { jwt: 'x', fetchImpl: noHash }), (e) => e.status === 502)
})
