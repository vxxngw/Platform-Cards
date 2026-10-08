// Route-level tests for /api/price and /api/eth against a fake Renaiss API and a fake Binance fetch.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import * as F from './fixtures.js'

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

let base
let server
let ethMode = 'ok'
test.before(async () => {
  await new Promise((r) => renaiss.listen(0, '127.0.0.1', r))
  // renaiss.js reads RENAISS_API_URL when it loads, so import the API only after the fake is listening
  process.env.RENAISS_API_URL = `http://127.0.0.1:${renaiss.address().port}`
  const { createPriceRouter } = await import('../_lib/price.js')
  const { createEthRouter } = await import('../_lib/eth.js')
  const { default: express } = await import('express')
  const app = express()
  app.use('/api/price', createPriceRouter())
  app.use('/api/eth', createEthRouter({
    fetchImpl: async () => (ethMode === 'ok' ? { ok: true, json: async () => ({ lastPrice: '3500.5', priceChangePercent: '-1.2' }) } : { ok: false, status: 451 }),
  }))
  server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/api`
})
test.after(async () => {
  await new Promise((r) => server.close(r))
  await new Promise((r) => renaiss.close(r))
})

const get = async (p) => { const r = await fetch(base + p); return { status: r.status, headers: r.headers, body: await r.json() } }

test('price: looks the card up via the metadata priceRef, verifies the hit and caches 24h', async () => {
  renaissCalls = []
  const q = '/price?set_name=151&item_no=199&variation=&language=en&card_name=Charizard%20ex'
  const a = await get(q)
  assert.equal(a.status, 200)
  assert.equal(a.body.found, true)
  assert.equal(a.body.best_estimate, 1405.07)
  assert.equal(a.body.gradeLabel, 'PSA 10')
  assert.equal(a.body.cached, false)
  assert.match(a.headers.get('cache-control'), /s-maxage=86400/)
  assert.equal(renaissCalls.length, 1)
  assert.match(renaissCalls[0], /q=Charizard\+ex\+151\+199/)

  const b = await get(q)
  assert.equal(b.body.cached, true)
  assert.equal(b.body.best_estimate, 1405.07)
  assert.equal(renaissCalls.length, 1, 'second request is served from the in-memory cache')
})

test('price: "025" matches Renaiss "25" and the right set among several hits', async () => {
  const r = await get('/price?set_name=151&item_no=025&language=en&card_name=Pikachu')
  assert.equal(r.body.found, true)
  assert.equal(r.body.best_estimate, 184.62)
})

test('price: unknown card → not_found; missing ref → no_price_ref', async () => {
  const nf = await get('/price?set_name=151&item_no=999&language=en&card_name=Nobody')
  assert.deepEqual({ found: nf.body.found, reason: nf.body.reason }, { found: false, reason: 'not_found' })
  const none = await get('/price')
  assert.deepEqual(none.body, { found: false, reason: 'no_price_ref' })
})

test('price: Renaiss quota (429) is reported as rate_limited, never as an HTTP error, and is not CDN-cached', async () => {
  renaissMode = '429'
  try {
    const r = await get('/price?set_name=151&item_no=198&language=en&card_name=Venusaur%20ex')
    assert.equal(r.status, 200)
    assert.deepEqual({ found: r.body.found, error: r.body.error }, { found: false, error: 'rate_limited' })
    assert.equal(r.headers.get('cache-control'), null)
  } finally { renaissMode = 'ok' }
})

test('eth: returns the Binance ticker, 502 when Binance fails', async () => {
  const ok = await get('/eth')
  assert.deepEqual({ last: ok.body.last, change24h: ok.body.change24h, pair: ok.body.pair }, { last: 3500.5, change24h: -1.2, pair: 'ETH/USDT' })
  ethMode = 'down'
  try { assert.equal((await get('/eth')).status, 502) } finally { ethMode = 'ok' }
})

test('app: unknown /api path answers 404 JSON', async () => {
  const { createApp } = await import('../_lib/app.js')
  const s = http.createServer(createApp({}))
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/nope`)
    assert.equal(r.status, 404)
    assert.deepEqual(await r.json(), { error: 'not found' })
    const pin = await fetch(`http://127.0.0.1:${s.address().port}/api/pin`)
    assert.equal((await pin.json()).mode, 'unconfigured')
  } finally { await new Promise((r) => s.close(r)) }
})
