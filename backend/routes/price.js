// Renaiss OS Index reference price — off-chain only, cached 24h, never touches contracts.
// priceRef comes from the card's IPFS metadata: ?set_name=&item_no=&variation=&language=&card_name=
// (demo mode still sends the legacy ?cardId= / ?q=).
const { Router } = require('express')
const E = require('../lib/engine')
const R = require('../lib/renaiss')

const router = Router()
const TTL_MS = 24 * 3600 * 1000
const ERR_TTL_MS = 3600 * 1000

const clip = (v, n) => String(v ?? '').slice(0, n).trim()
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

function refFromQuery(q) {
  if (q.set_name && q.item_no) {
    return {
      kind: 'item',
      ref: { set_name: clip(q.set_name, 80), item_no: clip(q.item_no, 20), variation: clip(q.variation, 40), language: clip(q.language, 10) || 'en', card_name: clip(q.card_name, 60) },
    }
  }
  if (q.q) return { kind: 'text', q: clip(q.q, 80) }
  return null
}

router.get('/', async (req, res) => {
  try {
    await E.ensureInit()
    let spec = refFromQuery(req.query)
    if (!spec) {
      const legacy = E.getCard(Number(req.query.cardId))?.price_ref
      if (legacy?.q) spec = { kind: 'text', q: clip(legacy.q, 80) }
    }
    if (!spec) return res.json({ found: false, reason: 'no_price_ref' })

    const key = spec.kind === 'item'
      ? `item|${norm(spec.ref.language)}|${norm(spec.ref.set_name)}|${norm(spec.ref.item_no)}|${norm(spec.ref.variation)}|${norm(spec.ref.card_name)}`
      : `q|${norm(spec.q)}`
    const [cached] = await E.q('SELECT data, fetched_at FROM tc_price_cache WHERE key=$1', [key])
    if (cached) {
      const age = Date.now() - new Date(cached.fetched_at).getTime()
      if (age < (cached.data?.error ? ERR_TTL_MS : TTL_MS)) return res.json({ ...cached.data, cached: true })
    }
    let data
    try {
      data = spec.kind === 'item' ? await R.lookup(spec.ref) : await R.lookupFreeText(spec.q)
    } catch (e) {
      // 429 (anonymous tier: 10 requests/day/IP) or network errors: hide the box, never block a trade
      data = { found: false, error: e.status === 429 ? 'rate_limited' : String(e.message || e) }
    }
    await E.q(
      `INSERT INTO tc_price_cache (key, data, fetched_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, fetched_at=NOW()`,
      [key, JSON.stringify(data)],
    )
    res.json({ ...data, cached: false })
  } catch (e) {
    res.json({ found: false, error: String(e.message || e) })
  }
})

module.exports = router
