const test = require('node:test')
const assert = require('node:assert/strict')
const R = require('../lib/renaiss')
const F = require('./fixtures')

test('normNumber strips leading zeros and the "/total" suffix', () => {
  assert.equal(R.normNumber('025'), '25')
  assert.equal(R.normNumber('199/165'), '199')
  assert.equal(R.normNumber('TG01'), 'tg1')
  assert.equal(R.normNumber(' 7 '), '7')
})

test('setMatches ignores "Pokémon" and requires equal numbers', () => {
  assert.ok(R.setMatches('Pokémon 151', '151'))
  assert.ok(R.setMatches('Paldean Fates', 'Paldean Fates'))
  assert.ok(R.setMatches('Scarlet & Violet Base Set', 'Scarlet & Violet'))
  assert.ok(!R.setMatches('Base Set 2', 'Base Set'), 'Base Set vs Base Set 2 must not match')
  assert.ok(!R.setMatches('Pokémon Card 151', 'Scarlet & Violet'), 'different sets')
  assert.ok(!R.setMatches('Twilight Masquerade', '151'))
  assert.ok(!R.setMatches('', '151'))
})

test('nameMatches is case/punctuation-insensitive but exact on words', () => {
  assert.ok(R.nameMatches('Charizard EX', 'Charizard ex'))
  assert.ok(R.nameMatches("Erika's Invitation", 'Erikas Invitation'))
  assert.ok(!R.nameMatches('Charizard', 'Charizard ex'))
  assert.ok(R.nameMatches('Anything', undefined))
})

const ref = (o) => ({ set_name: '151', item_no: '199', variation: '', language: 'en', card_name: 'Charizard ex', ...o })

test('pickMatch finds Charizard ex #199 and ignores other games and sets', () => {
  const hit = R.pickMatch(F.charizardSearch, ref())
  assert.equal(hit.href, '/card/pokemon/pokemon-151/199-charizard-ex-psa-10-7cb6e9ea')
})

test('pickMatch finds the right Pikachu even though it is the last result (number 025 = 25)', () => {
  const hit = R.pickMatch(F.pikachuSearch, ref({ item_no: '025', card_name: 'Pikachu' }))
  assert.equal(hit.setName, 'Pokémon 151')
  assert.equal(hit.priceUsdCents, 18462)
})

test('pickMatch respects language and prefers a priced hit', () => {
  const en = R.pickMatch(F.blastoiseSearch, ref({ item_no: '200', card_name: 'Blastoise ex' }))
  assert.equal(en.language, 'English')
  assert.equal(en.priceUsdCents, 51679)
  const es = R.pickMatch(F.blastoiseSearch, ref({ item_no: '200', card_name: 'Blastoise ex', language: 'es' }))
  assert.equal(es.language, 'Spanish')
  assert.equal(es.priceUsdCents, null)
  assert.equal(R.pickMatch(F.blastoiseSearch, ref({ item_no: '200', card_name: 'Blastoise ex', language: 'ja' })), null, 'the Japanese hit belongs to another card')
})

test('pickMatch returns null when nothing matches (wrong number, wrong name, empty)', () => {
  assert.equal(R.pickMatch(F.charizardSearch, ref({ item_no: '1' })), null)
  assert.equal(R.pickMatch(F.charizardSearch, ref({ card_name: 'Mewtwo' })), null)
  assert.equal(R.pickMatch([], ref()), null)
  assert.equal(R.pickMatch(undefined, ref()), null)
})

test('pickMatch picks a priced hit, then higher confidence, when a card has several grades', () => {
  const base = { name: 'Charizard ex', setName: 'Pokémon 151', cardNumber: '199', language: 'English' }
  const hits = [
    { ...base, href: '/card/pokemon/pokemon-151/199-a', priceUsdCents: 100, confidence: 'low', lastSaleAt: '2026-09-30T00:00:00Z' },
    { ...base, href: '/card/pokemon/pokemon-151/199-b', priceUsdCents: 200, confidence: 'high', lastSaleAt: '2026-01-01T00:00:00Z' },
    { ...base, href: '/card/pokemon/pokemon-151/199-c', priceUsdCents: null, confidence: 'prime', lastSaleAt: '2026-10-01T00:00:00Z' },
  ]
  assert.equal(R.pickMatch(hits, ref()).href, '/card/pokemon/pokemon-151/199-b')
})

test('searchQuery joins name, set and number within 80 chars', () => {
  assert.equal(R.searchQuery(ref()), 'Charizard ex 151 199')
  assert.ok(R.searchQuery(ref({ card_name: 'x'.repeat(200) })).length <= 80)
})

test('toPrice exposes best_estimate in USD plus the grade label', () => {
  const p = R.toPrice(R.pickMatch(F.charizardSearch, ref()))
  assert.equal(p.found, true)
  assert.equal(p.best_estimate, 1405.07)
  assert.equal(p.currency, 'USD')
  assert.equal(p.gradeLabel, 'PSA 10')
  assert.equal(p.confidence_tier, 'high')
  assert.equal(p.url, 'https://index.renaissos.com/card/pokemon/pokemon-151/199-charizard-ex-psa-10-7cb6e9ea')
  assert.ok(Number.isInteger(p.freshness_days))
})

test('toPrice reports a matched card without a price as not found (no number to show)', () => {
  const p = R.toPrice({ name: 'Blastoise ex', setName: 'Pokémon 151', cardNumber: '200', priceUsdCents: null, href: '/card/pokemon/x' })
  assert.equal(p.found, false)
  assert.equal(p.reason, 'no_price')
  assert.equal(p.best_estimate, null)
})

test('lookup uses the search endpoint and verifies the hit', async () => {
  const calls = []
  const fetchImpl = async (url) => { calls.push(String(url)); return { ok: true, json: async () => ({ results: F.pikachuSearch }) } }
  const p = await R.lookup(ref({ item_no: '025', card_name: 'Pikachu' }), { fetchImpl })
  assert.equal(p.best_estimate, 184.62)
  assert.match(calls[0], /\/v1\/search\?q=Pikachu\+151\+025&limit=20$/)
  assert.deepEqual(await R.lookup({ set_name: '151' }, { fetchImpl }), { found: false, reason: 'no_price_ref' })
  const none = await R.lookup(ref({ item_no: '999', card_name: 'Nobody' }), { fetchImpl })
  assert.deepEqual(none, { found: false, reason: 'not_found' })
})

test('lookup surfaces HTTP errors with their status (429 = quota)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429 })
  await assert.rejects(() => R.lookup(ref(), { fetchImpl }), (e) => e.status === 429)
})
