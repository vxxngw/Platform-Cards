// Route-level tests for /api/metadata and /api/price with the demo engine (platform DB) replaced by an in-memory fake.
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const F = require('./fixtures')

// --- fake Renaiss API ---
let renaissCalls = []
let renaissMode = 'ok'
const renaiss = http.createServer((req, res) => {
  renaissCalls.push(req.url)
  if (renaissMode === '429') { res.statusCode = 429; return res.end('{}') }
  const q = new URL(req.url, 'http://x').searchParams.get('q') || ''
  const results = q.startsWith('Charizard') ? F.charizardSearch : q.startsWith('Pikachu') ? F.pikachuSearch : []
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ query: q, results, sets: [] }))
})

// --- fake engine (replaces ../lib/engine in the require cache before the routes load) ---
const tables = { metadata: new Map(), price: new Map() }
let metadataTableMissing = false
const fakeEngine = {
  RARITY: ['Common', 'Rare', 'Epic', 'Legendary', 'Reward'],
  ensureInit: async () => {},
  getCard: (id) => (id === 1 ? { id: 1, set_id: 1, name: 'Hoả Tốt', rarity: 0, max_supply: 10000, card_no: 1, is_reward: false, price_ref: { q: 'charizard base set' } } : null),
  getSet: () => ({ id: 1, name: 'Thần Thú Việt' }),
  allCards: () => [{ id: 1, set_id: 1, is_reward: false }],
  q: async (sql, params = []) => {
    if (/tc_metadata/.test(sql) && metadataTableMissing) throw new Error('relation "tc_metadata" does not exist')
    if (/SELECT data FROM tc_metadata/.test(sql)) return tables.metadata.has(params[0]) ? [{ data: tables.metadata.get(params[0]) }] : []
    if (/COUNT\(\*\)::int AS n FROM tc_metadata/.test(sql)) return [{ n: tables.metadata.size }]
    if (/SELECT data, fetched_at FROM tc_price_cache/.test(sql)) return tables.price.has(params[0]) ? [tables.price.get(params[0])] : []
    if (/INSERT INTO tc_price_cache/.test(sql)) { tables.price.set(params[0], { data: JSON.parse(params[1]), fetched_at: new Date() }); return [] }
    throw new Error('unexpected SQL ' + sql)
  },
}
const enginePath = require.resolve('../lib/engine')
require.cache[enginePath] = { id: enginePath, filename: enginePath, loaded: true, exports: fakeEngine }

let base
let server
test.before(async () => {
  await new Promise((r) => renaiss.listen(0, '127.0.0.1', r))
  process.env.RENAISS_API_URL = `http://127.0.0.1:${renaiss.address().port}`
  const app = express()
  app.use(express.json())
  app.use('/api/metadata', require('../routes/metadata'))
  app.use('/api/price', require('../routes/price'))
  server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/api`
})
test.after(async () => {
  await new Promise((r) => server.close(r))
  await new Promise((r) => renaiss.close(r))
})

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() } }

test('metadata: serves demo cards while tc_metadata is empty', async () => {
  const r = await get('/metadata/1.json')
  assert.equal(r.status, 200)
  assert.equal(r.body.name, 'Hoả Tốt #1')
  assert.equal((await get('/metadata/999')).status, 404)
  assert.equal((await get('/metadata/abc')).status, 400)
})

test('metadata: falls back to demo mode when the table does not exist yet', async () => {
  metadataTableMissing = true
  try { assert.equal((await get('/metadata/1')).body.name, 'Hoả Tốt #1') } finally { metadataTableMissing = false }
})

test('metadata: Pack Builder rows win, and unknown ids never fall back to demo cards', async () => {
  tables.metadata.set(25, { name: 'Charizard ex', source: 'tcgdex' })
  const hit = await get('/metadata/25.json')
  assert.equal(hit.status, 200)
  assert.equal(hit.body.name, 'Charizard ex')
  const demoId = await get('/metadata/1.json') // id 1 exists as a demo card but is not stored
  assert.equal(demoId.status, 404)
})

test('price: looks the card up via the metadata priceRef, verifies the hit and caches 24h', async () => {
  renaissCalls = []
  const q = '/price?set_name=151&item_no=199&variation=&language=en&card_name=Charizard%20ex'
  const a = await get(q)
  assert.equal(a.status, 200)
  assert.equal(a.body.found, true)
  assert.equal(a.body.best_estimate, 1405.07)
  assert.equal(a.body.gradeLabel, 'PSA 10')
  assert.equal(a.body.cached, false)
  assert.equal(renaissCalls.length, 1)
  assert.match(renaissCalls[0], /q=Charizard\+ex\+151\+199/)

  const b = await get(q)
  assert.equal(b.body.cached, true)
  assert.equal(b.body.best_estimate, 1405.07)
  assert.equal(renaissCalls.length, 1, 'second request is served from tc_price_cache')
})

test('price: "025" matches Renaiss "25" and the right set among several hits', async () => {
  const r = await get('/price?set_name=151&item_no=025&language=en&card_name=Pikachu')
  assert.equal(r.body.found, true)
  assert.equal(r.body.best_estimate, 184.62)
})

test('price: unknown card → not_found; missing ref → no_price_ref', async () => {
  const nf = await get('/price?set_name=151&item_no=999&language=en&card_name=Nobody')
  assert.deepEqual({ found: nf.body.found, reason: nf.body.reason }, { found: false, reason: 'not_found' })
  const none = await get('/price?cardId=999')
  assert.deepEqual(none.body, { found: false, reason: 'no_price_ref' })
})

test('price: Renaiss quota (429) is reported as rate_limited, never as an HTTP error', async () => {
  renaissMode = '429'
  try {
    const r = await get('/price?set_name=151&item_no=198&language=en&card_name=Venusaur%20ex')
    assert.equal(r.status, 200)
    assert.deepEqual({ found: r.body.found, error: r.body.error }, { found: false, error: 'rate_limited' })
  } finally { renaissMode = 'ok' }
})

test('price: legacy demo priceRef (?cardId → price_ref.q) still resolves', async () => {
  tables.price.clear()
  const r = await get('/price?cardId=1')
  assert.equal(r.status, 200)
  assert.ok('found' in r.body)
})
