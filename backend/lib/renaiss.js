// Renaiss OS Index reference-price lookup (off-chain only, never touches the contracts).
//
// Spec v2 names `GET /v1/index/item-by-no`, but the public API (https://api.renaissos.com/v1/openapi.json) has no such
// endpoint any more: cards are found with `GET /v1/search?q=…` and each hit carries `href`, `setName`, `cardNumber`,
// `language`, `priceUsdCents`, … So we search by "<card name> <set name> <number>" and verify the hit ourselves.

const BASE = process.env.RENAISS_API_URL || 'https://api.renaissos.com'

// Language label Renaiss prints ("English", "Japanese", …) keyed by the TCGdex language code.
const LANGUAGE_KEYWORD = { en: 'english', ja: 'japanese', fr: 'french', de: 'german', es: 'spanish', it: 'italian', pt: 'portuguese', ko: 'korean', zh: 'chinese', id: 'indonesian', th: 'thai', nl: 'dutch', pl: 'polish', ru: 'russian' }

const SET_STOP_WORDS = new Set(['pokemon', 'the', 'card', 'cards', 'tcg', 'tcgp'])
const CONFIDENCE_RANK = { prime: 4, high: 3, medium: 2, low: 1 }

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// apostrophes are dropped, not split: "Erika's" and "Erikas" are the same word across sources
const tokens = (s) => strip(s).replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

/** "025" → "25", "199/165" → "199"; prefixes are kept ("SWSH001" → "swsh1"). */
function normNumber(s) {
  const base = strip(s).split('/')[0].trim().replace(/\s+/g, '')
  const m = base.match(/^([a-z]*)0*(\d+)([a-z]*)$/)
  return m ? `${m[1]}${m[2]}${m[3]}` : base
}

function languageMatches(candidate, wantedCode) {
  if (!wantedCode || !candidate) return true // unknown on either side → do not reject
  const kw = LANGUAGE_KEYWORD[String(wantedCode).toLowerCase().split('-')[0]]
  return !kw || strip(candidate).includes(kw)
}

/** Set names differ between sources ("151" vs "Pokémon 151"): compare token sets, numbers must agree exactly. */
function setMatches(candidate, wanted) {
  const a = tokens(candidate).filter((t) => !SET_STOP_WORDS.has(t))
  const b = tokens(wanted).filter((t) => !SET_STOP_WORDS.has(t))
  if (!a.length || !b.length) return false
  const digits = (arr) => arr.filter((t) => /\d/.test(t)).sort().join(',')
  if (digits(a) !== digits(b)) return false
  const [small, large] = a.length <= b.length ? [a, b] : [b, a]
  return small.every((t) => large.includes(t))
}

const nameMatches = (candidate, wanted) => {
  if (!wanted) return true
  const a = tokens(candidate).sort().join(' ')
  const b = tokens(wanted).sort().join(' ')
  return a === b
}

/**
 * Chooses the hit for a priceRef { set_name, item_no, variation, language, card_name } or null.
 * Only Pokémon hits count (the search spans every game). Among matches, priced and higher-confidence hits win.
 */
function pickMatch(results, ref) {
  const wantedNo = normNumber(ref.item_no)
  const wantedVar = strip(ref.variation || '').trim()
  const hits = (Array.isArray(results) ? results : []).filter((r) => {
    if (!r || typeof r.href !== 'string' || !r.href.startsWith('/card/pokemon/')) return false
    if (normNumber(r.cardNumber) !== wantedNo) return false
    if (!setMatches(r.setName, ref.set_name)) return false
    if (!languageMatches(r.language, ref.language)) return false
    if (!nameMatches(r.name, ref.card_name)) return false
    if (wantedVar && strip(r.variation || '').trim() !== wantedVar) return false
    return true
  })
  if (!hits.length) return null
  const score = (r) => [r.priceUsdCents != null ? 1 : 0, CONFIDENCE_RANK[r.confidence] || 0, Date.parse(r.lastSaleAt || r.updatedAt || 0) || 0]
  hits.sort((x, y) => {
    const a = score(x), b = score(y)
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]
    return 0
  })
  return hits[0]
}

function toPrice(hit) {
  const last = hit.lastSaleAt || hit.updatedAt
  return {
    found: hit.priceUsdCents != null,
    reason: hit.priceUsdCents != null ? undefined : 'no_price',
    name: hit.name ?? null,
    setName: hit.setName ?? null,
    cardNumber: hit.cardNumber ?? null,
    variation: hit.variation ?? null,
    gradeLabel: hit.gradeLabel ?? null,
    best_estimate: hit.priceUsdCents != null ? hit.priceUsdCents / 100 : null,
    currency: 'USD',
    confidence_tier: hit.confidence ?? null,
    freshness_days: last ? Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 86400000)) : null,
    imageUrl: hit.imageUrlThumb || hit.imageUrl || null,
    url: hit.href ? `https://index.renaissos.com${hit.href}` : 'https://index.renaissos.com',
  }
}

function searchQuery(ref) {
  return [ref.card_name, ref.set_name, ref.item_no].filter(Boolean).join(' ').slice(0, 80).trim()
}

async function search(q, { fetchImpl = fetch, limit = 20 } = {}) {
  const headers = { Accept: 'application/json' }
  if (process.env.RENAISS_API_KEY) headers['X-Api-Key'] = process.env.RENAISS_API_KEY
  if (process.env.RENAISS_API_SECRET) headers['X-Api-Secret'] = process.env.RENAISS_API_SECRET
  const url = `${BASE}/v1/search?` + new URLSearchParams({ q, limit: String(limit) })
  const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12000) })
  if (!r.ok) {
    const e = new Error(`Renaiss HTTP ${r.status}`)
    e.status = r.status
    throw e
  }
  const j = await r.json()
  return Array.isArray(j?.results) ? j.results : []
}

/** Looks one card up by its priceRef. Returns the price object, or { found:false, reason:'not_found' }. */
async function lookup(ref, opts) {
  if (!ref?.set_name || !ref?.item_no) return { found: false, reason: 'no_price_ref' }
  const results = await search(searchQuery(ref), opts)
  const hit = pickMatch(results, ref)
  return hit ? toPrice(hit) : { found: false, reason: 'not_found' }
}

/** Legacy demo-mode priceRef `{ game, q }`: first Pokémon hit that has a price. */
async function lookupFreeText(q, opts) {
  const results = await search(String(q).slice(0, 80), opts)
  const hit = results.find((x) => x?.href?.startsWith('/card/pokemon/') && typeof x.priceUsdCents === 'number')
  return hit ? toPrice(hit) : { found: false, reason: 'not_found' }
}

module.exports = { normNumber, setMatches, nameMatches, languageMatches, pickMatch, searchQuery, toPrice, lookup, lookupFreeText, search }
