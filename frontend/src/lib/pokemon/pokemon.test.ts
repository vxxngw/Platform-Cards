import { describe, expect, it } from 'vitest'
import { mapLimit } from './async'
import { buildCardMetadata, buildMetadataFolder, CARD_DESCRIPTION, imageUrl, orderPool, parseCardMetadata, poolCardFromTcgdex, REWARD_TIER } from './metadata'
import { suggestTier } from './tiers'
import type { PoolCard, TcgdexCard } from './types'
import { previewPool, validateDraft, type DraftInput } from './validate'

const charizard: TcgdexCard = {
  id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: 'https://assets.tcgdex.net/en/sv/sv03.5/199',
  rarity: 'Special illustration rare', set: { id: 'sv03.5', name: '151' },
}

function card(over: Partial<PoolCard> & { i: number }): PoolCard {
  const { i, ...rest } = over
  return {
    key: `en:sv03.5-${i}`, tcgdexId: `sv03.5-${i}`, lang: 'en', setId: 'sv03.5', setName: '151', localId: String(i), name: `Card ${i}`,
    image: `https://assets.tcgdex.net/en/sv/sv03.5/${i}`, officialRarity: 'Common', tier: 0, tierSource: 'table', maxSupply: 10_000,
    custom: false, variation: '', ...rest,
  }
}
// 5/3/2/1 pool
const pool: PoolCard[] = [
  ...[1, 2, 3, 4, 5].map((i) => card({ i })),
  ...[6, 7, 8].map((i) => card({ i, tier: 1, officialRarity: 'Rare', maxSupply: 3000 })),
  ...[9, 10].map((i) => card({ i, tier: 2, officialRarity: 'Ultra Rare', maxSupply: 800 })),
  card({ i: 11, tier: 3, officialRarity: 'Hyper rare', maxSupply: 100 }),
]
const reward = card({ i: 12, officialRarity: 'Special illustration rare', tier: null, tierSource: null })

describe('suggestTier (spec v2 §2 table)', () => {
  it.each([
    ['Common', 0], ['Uncommon', 0], ['Rare', 1], ['Rare Holo', 1], ['Double rare', 1],
    ['Ultra Rare', 2], ['Illustration rare', 2],
    ['Special illustration rare', 3], ['Hyper rare', 3], ['Secret Rare', 3],
  ])('%s → tier %i (table)', (r, t) => {
    expect(suggestTier(r)).toEqual({ tier: t, source: 'table' })
  })

  it('is case- and whitespace-insensitive', () => {
    expect(suggestTier('  DOUBLE   RARE ')).toEqual({ tier: 1, source: 'table' })
    expect(suggestTier('special ILLUSTRATION rare')?.tier).toBe(3)
  })

  it('marks equivalents outside the table as inferred', () => {
    expect(suggestTier('Holo Rare')).toEqual({ tier: 1, source: 'inferred' })
    expect(suggestTier('Holo Rare VMAX')).toEqual({ tier: 2, source: 'inferred' })
    expect(suggestTier('Mega Hyper Rare')).toEqual({ tier: 3, source: 'inferred' })
  })

  it('returns null for missing or unknown rarities, forcing a manual choice', () => {
    for (const r of [undefined, null, '', 'None', 'Promo', 'ACE SPEC Rare', 'Two Diamond', 'Crown']) expect(suggestTier(r)).toBeNull()
  })

  it('does not confuse "Illustration rare" with "Special illustration rare"', () => {
    expect(suggestTier('Illustration rare')?.tier).toBe(2)
    expect(suggestTier('Special illustration rare')?.tier).toBe(3)
  })
})

describe('imageUrl', () => {
  it('appends /high.webp or /low.webp to the TCGdex base', () => {
    expect(imageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199')).toBe('https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp')
    expect(imageUrl('https://assets.tcgdex.net/en/sv/sv03.5/199/', 'low')).toBe('https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp')
  })
  it('passes full image URLs and nullish values through', () => {
    expect(imageUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(imageUrl(null)).toBeNull()
    expect(imageUrl(undefined)).toBeNull()
  })
})

describe('poolCardFromTcgdex', () => {
  it('auto-fills fields and the tier', () => {
    const c = poolCardFromTcgdex('en', charizard)
    expect(c).toMatchObject({
      key: 'en:sv03.5-199', tcgdexId: 'sv03.5-199', setId: 'sv03.5', setName: '151', localId: '199', name: 'Charizard ex',
      officialRarity: 'Special illustration rare', tier: 3, tierSource: 'table', maxSupply: 100, custom: false,
    })
  })
  it('leaves the tier empty when the rarity is missing', () => {
    const c = poolCardFromTcgdex('en', { ...charizard, rarity: undefined })
    expect(c.tier).toBeNull()
    expect(c.officialRarity).toBeNull()
  })
})

describe('buildCardMetadata (spec v2 §4)', () => {
  it('matches the documented shape', () => {
    const m = buildCardMetadata(poolCardFromTcgdex('en', charizard), 'Legendary')
    expect(m).toEqual({
      name: 'Charizard ex',
      description: CARD_DESCRIPTION,
      image: 'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp',
      attributes: [
        { trait_type: 'Set', value: '151' },
        { trait_type: 'Card No.', value: '199' },
        { trait_type: 'Official Rarity', value: 'Special illustration rare' },
        { trait_type: 'Tier', value: 'Legendary' },
      ],
      source: 'tcgdex',
      tcgdexId: 'sv03.5-199',
      lang: 'en',
      priceRef: { set_name: '151', item_no: '199', variation: '', language: 'en', card_name: 'Charizard ex' },
    })
    expect(m.description).toContain('Not affiliated with Nintendo')
  })
  it('omits priceRef and image for hand-entered cards', () => {
    const m = buildCardMetadata(card({ i: 1, custom: true, tcgdexId: '', image: null }), 'Common')
    expect(m.source).toBe('custom')
    expect(m.priceRef).toBeUndefined()
    expect(m.image).toBeUndefined()
    expect(m.tcgdexId).toBeUndefined()
  })
})

describe('buildMetadataFolder', () => {
  it('assigns ids in order, reward last, and keeps existing tokens resolvable', () => {
    const ordered = orderPool(pool)
    const files = buildMetadataFolder({ firstCardId: 25, pool: ordered, reward, existing: { 1: { name: 'old one' } } })
    const keys = Object.keys(files)
    expect(keys).toHaveLength(24 + 11 + 1)
    expect(keys[0]).toBe('1.json')
    expect(files['1.json']).toEqual({ name: 'old one' })
    expect((files['2.json'] as { name: string }).name).toBe('Card #2') // filler for ids we could not fetch
    expect((files['25.json'] as { attributes: any[] }).attributes.at(-1)).toEqual({ trait_type: 'Tier', value: 'Common' })
    expect((files['35.json'] as { attributes: any[] }).attributes.at(-1)).toEqual({ trait_type: 'Tier', value: 'Legendary' })
    expect((files['36.json'] as { attributes: any[] }).attributes.at(-1)).toEqual({ trait_type: 'Tier', value: REWARD_TIER })
  })
  it('orderPool sorts by tier then numeric card number', () => {
    const shuffled = [pool[10], pool[3], pool[8], pool[0], pool[6]]
    expect(orderPool(shuffled).map((c) => c.localId)).toEqual(['1', '4', '7', '9', '11'])
  })
})

describe('parseCardMetadata', () => {
  it('reads a v2 snapshot', () => {
    const p = parseCardMetadata(buildCardMetadata(poolCardFromTcgdex('en', charizard), 'Legendary'))
    expect(p).toMatchObject({
      name: 'Charizard ex', setName: '151', localId: '199', officialRarity: 'Special illustration rare', tier: 'Legendary',
      tcgdexId: 'sv03.5-199', lang: 'en', image: 'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp',
    })
    expect(p.priceRef).toEqual({ set_name: '151', item_no: '199', variation: '', language: 'en', card_name: 'Charizard ex' })
  })
  it('tolerates the old v1 shape and garbage', () => {
    const v1 = parseCardMetadata({ name: 'Fire Dragon #1', image: 'ipfs://<IMAGES_CID>/1.png', hue: 40, priceRef: { game: 'pokemon', q: 'charizard' }, attributes: [{ trait_type: 'Rarity', value: 'Legendary' }] })
    expect(v1.image).toBeUndefined() // placeholder image is ignored
    expect(v1.tier).toBe('Legendary')
    expect(v1.priceRef).toEqual({ q: 'charizard', game: 'pokemon' })
    expect(parseCardMetadata(null)).toEqual({})
    expect(parseCardMetadata('x')).toEqual({})
  })
})

describe('validateDraft (spec v2 §3 checklist)', () => {
  const ok: DraftInput = { pool, reward, setName: '151', priceEth: '0.01', packs: '1000', rewardSupply: '50', connected: true, isAdmin: true, rightNetwork: true }
  const failing = (d: DraftInput) => validateDraft(d).filter((x) => !x.ok).map((x) => x.id)

  it('passes a complete 5/3/2/1 draft', () => expect(failing(ok)).toEqual([]))
  it('needs exactly 11 cards', () => expect(failing({ ...ok, pool: pool.slice(0, 10) })).toContain('size'))
  it('needs every tier to have a card', () => {
    const noLegendary = pool.map((c) => (c.tier === 3 ? { ...c, tier: 2 as const } : c))
    expect(failing({ ...ok, pool: noLegendary })).toContain('tiers')
  })
  it('rejects cards without a tier or with maxSupply <= 0', () => {
    expect(failing({ ...ok, pool: [{ ...pool[0], tier: null }, ...pool.slice(1)] })).toEqual(expect.arrayContaining(['tiers', 'supply']))
    expect(failing({ ...ok, pool: [{ ...pool[0], maxSupply: 0 }, ...pool.slice(1)] })).toContain('supply')
  })
  it('requires a reward card that is not in the pool', () => {
    expect(failing({ ...ok, reward: null })).toContain('reward')
    expect(failing({ ...ok, reward: pool[0] })).toContain('reward')
    expect(failing({ ...ok, reward: { ...reward, key: 'x', tcgdexId: pool[1].tcgdexId } })).toContain('reward')
  })
  it('validates the numeric form fields', () => {
    for (const bad of [{ priceEth: '0' }, { priceEth: 'abc' }, { packs: '0' }, { packs: '1.5' }, { rewardSupply: '' }, { setName: '  ' }]) {
      expect(failing({ ...ok, ...bad })).toContain('form')
    }
  })
  it('requires an admin wallet on the right network', () => {
    expect(failing({ ...ok, connected: false })).toContain('wallet')
    expect(failing({ ...ok, isAdmin: false })).toContain('wallet')
    expect(failing({ ...ok, rightNetwork: false })).toContain('wallet')
  })
})

describe('previewPool', () => {
  it('reports counts, per-card odds and no warnings for 5/3/2/1', () => {
    const p = previewPool(pool)
    expect(p.counts).toEqual({ 0: 5, 1: 3, 2: 2, 3: 1 })
    expect(p.rows.map((r) => r.perCard)).toEqual([12, 28 / 3, 5, 2])
    expect(p.warnings).toEqual([])
  })
  it('warns about empty tiers and unusual compositions', () => {
    const noLeg = pool.map((c) => (c.tier === 3 ? { ...c, tier: 2 as const } : c))
    expect(previewPool(noLeg).warnings.join(' ')).toContain('Legendary tier has no cards')
    const skew = pool.map((c, i) => (i === 0 ? { ...c, tier: 1 as const } : c))
    expect(previewPool(skew).warnings.join(' ')).toContain('recommended mix')
    const noCommon = pool.map((c) => ({ ...c, tier: Math.max(1, c.tier ?? 1) as 1 | 2 | 3 }))
    expect(previewPool(noCommon).warnings.join(' ')).toContain('Common tier is empty')
  })
})

describe('mapLimit', () => {
  it('keeps order and respects the concurrency limit', async () => {
    let active = 0, peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return n * 2
    })
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBeLessThanOrEqual(3)
  })
})

describe('pin message', () => {
  it('is byte-for-byte the same on the client and in the /api/pin function', async () => {
    const { pinMessage } = await import('./pin')
    // @ts-expect-error — plain JS module without type declarations
    const server = await import('../../../api/_lib/pin.js')
    expect(pinMessage('ab12', 1700000000000)).toBe(server.pinMessage('ab12', 1700000000000))
  })
})
