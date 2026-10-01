// Renaiss OS Index reference price — off-chain only, never touches contracts.
// priceRef comes from the card's IPFS metadata: ?set_name=&item_no=&variation=&language=&card_name=
// Cached 24h per instance in memory, and by Vercel's CDN through Cache-Control (successful lookups only).
import { Router } from 'express'
import * as R from './renaiss.js'

const TTL_MS = 24 * 3600 * 1000
const ERR_TTL_MS = 3600 * 1000
const MAX_ENTRIES = 2000

const clip = (v, n) => String(v ?? '').slice(0, n).trim()
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

function refFromQuery(q) {
  if (q.set_name && q.item_no) {
    return { set_name: clip(q.set_name, 80), item_no: clip(q.item_no, 20), variation: clip(q.variation, 40), language: clip(q.language, 10) || 'en', card_name: clip(q.card_name, 60) }
  }
  return null
}

export function createPriceRouter({ lookup = R.lookup, now = () => Date.now() } = {}) {
  const router = Router()
  const cache = new Map()

  router.get('/', async (req, res) => {
    const ref = refFromQuery(req.query)
    if (!ref) return res.json({ found: false, reason: 'no_price_ref' })
    const key = `${norm(ref.language)}|${norm(ref.set_name)}|${norm(ref.item_no)}|${norm(ref.variation)}|${norm(ref.card_name)}`
    const hit = cache.get(key)
    if (hit && now() - hit.at < (hit.data.error ? ERR_TTL_MS : TTL_MS)) return res.json({ ...hit.data, cached: true })

    let data
    try {
      data = await lookup(ref)
    } catch (e) {
      // 429 (anonymous tier: 10 requests/day/IP) or network errors: hide the box, never block a trade
      data = { found: false, error: e.status === 429 ? 'rate_limited' : String(e.message || e) }
    }
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value)
    cache.set(key, { at: now(), data })
    if (!data.error) res.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400')
    res.json({ ...data, cached: false })
  })
  return router
}
