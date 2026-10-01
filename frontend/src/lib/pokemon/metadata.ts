import { DEFAULT_MAX_SUPPLY, TIER_NAMES, suggestTier, type Tier } from './tiers'
import type { CardMetadata, PoolCard, TcgdexCard } from './types'

export const CARD_DESCRIPTION = 'Bản số học thuật của thẻ Pokémon TCG. Không liên kết với Nintendo hay The Pokémon Company.'
export const REWARD_DESCRIPTION = `${CARD_DESCRIPTION} Thẻ thưởng chỉ nhận được khi đổi (burn) trọn bộ.`
export const REWARD_TIER = 'Reward'

const HAS_EXT = /\.(webp|png|jpe?g|avif|gif)(\?.*)?$/i

/** TCGdex `image` is a base URL; append `/high.webp` or `/low.webp` (spec v2 §2). Full image URLs are passed through. */
export function imageUrl(image: string | null | undefined, quality: 'high' | 'low' = 'high'): string | null {
  if (!image) return null
  if (HAS_EXT.test(image)) return image
  return `${image.replace(/\/+$/, '')}/${quality}.webp`
}

/** TCGdex serves `/high.webp` and `/low.webp`; grids use the small one. Other URLs are returned unchanged. */
export function cardImageSrc(url: string | null | undefined, quality: 'high' | 'low'): string | null {
  if (!url) return null
  return url.replace(/\/(high|low)\.webp$/, `/${quality}.webp`)
}

/** Builds a Pack Builder card from the TCGdex `/cards/{id}` response; the tier is pre-filled from the rarity table. */
export function poolCardFromTcgdex(lang: string, c: TcgdexCard): PoolCard {
  const s = suggestTier(c.rarity)
  return {
    key: `${lang}:${c.id}`,
    tcgdexId: c.id,
    lang,
    setId: c.set.id,
    setName: c.set.name,
    localId: c.localId,
    name: c.name,
    image: c.image ?? null,
    officialRarity: c.rarity ?? null,
    tier: s?.tier ?? null,
    tierSource: s?.source ?? null,
    maxSupply: DEFAULT_MAX_SUPPLY[s?.tier ?? 0],
    custom: false,
    variation: '',
  }
}

export function tierLabel(tier: Tier | null): string {
  return tier == null ? '—' : TIER_NAMES[tier]
}

export function buildCardMetadata(c: PoolCard, tierName: string): CardMetadata {
  const img = imageUrl(c.image, 'high')
  const meta: CardMetadata = {
    name: c.name,
    description: tierName === REWARD_TIER ? REWARD_DESCRIPTION : CARD_DESCRIPTION,
    ...(img ? { image: img } : {}),
    attributes: [
      { trait_type: 'Set', value: c.setName },
      { trait_type: 'Card No.', value: c.localId },
      ...(c.officialRarity ? [{ trait_type: 'Official Rarity', value: c.officialRarity }] : []),
      { trait_type: 'Tier', value: tierName },
    ],
    source: c.custom ? 'custom' : 'tcgdex',
    ...(c.tcgdexId ? { tcgdexId: c.tcgdexId } : {}),
    lang: c.lang,
  }
  // Hand-entered cards have no real counterpart, so they get no reference price (spec v2 §4).
  if (!c.custom) {
    meta.priceRef = { set_name: c.setName, item_no: c.localId, variation: c.variation || '', language: c.lang, card_name: c.name }
  }
  return meta
}

/** Stable on-chain order: Common → Legendary, then by card number. */
export function orderPool(pool: PoolCard[]): PoolCard[] {
  const num = (s: string) => {
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
  }
  return [...pool].sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || num(a.localId) - num(b.localId) || a.localId.localeCompare(b.localId))
}

/** Placeholder JSON for ids whose metadata cannot be fetched, so the new folder still resolves every existing token. */
export function fillerMetadata(id: number): CardMetadata {
  return { name: `Thẻ #${id}`, description: CARD_DESCRIPTION, attributes: [], source: 'custom' }
}

/**
 * The CardCollection has ONE base URI for every token, so each publish pins a folder that holds the JSON of all
 * existing tokens (`existing`, null → filler) plus the new set: pool ids firstCardId.., then the reward id.
 */
export function buildMetadataFolder(args: {
  firstCardId: number
  pool: PoolCard[]
  reward: PoolCard
  existing: Record<number, unknown | null>
}): Record<string, unknown> {
  const { firstCardId, pool, reward, existing } = args
  const files: Record<string, unknown> = {}
  for (let id = 1; id < firstCardId; id++) files[`${id}.json`] = existing[id] ?? fillerMetadata(id)
  pool.forEach((c, i) => {
    files[`${firstCardId + i}.json`] = buildCardMetadata(c, tierLabel(c.tier))
  })
  files[`${firstCardId + pool.length}.json`] = buildCardMetadata(reward, REWARD_TIER)
  return files
}

/** Reads the fields the UI needs from a metadata JSON (v2 TCGdex snapshot, or the older v1/demo shapes). */
export function parseCardMetadata(json: unknown): {
  name?: string
  image?: string
  setName?: string
  localId?: string
  officialRarity?: string
  tier?: string
  tcgdexId?: string
  lang?: string
  hue?: number
  priceRef?: { set_name?: string; item_no?: string; variation?: string; language?: string; card_name?: string; game?: string; q?: string } | null
} {
  if (!json || typeof json !== 'object') return {}
  const j = json as Record<string, any>
  const attr = (t: string) => {
    const a = Array.isArray(j.attributes) ? j.attributes.find((x: any) => x?.trait_type === t) : null
    return a?.value != null ? String(a.value) : undefined
  }
  let priceRef: ReturnType<typeof parseCardMetadata>['priceRef'] = null
  const p = j.priceRef
  if (p && typeof p === 'object') {
    if (p.set_name && p.item_no) priceRef = { set_name: String(p.set_name), item_no: String(p.item_no), variation: p.variation ? String(p.variation) : '', language: p.language ? String(p.language) : 'en', card_name: p.card_name ? String(p.card_name) : j.name ? String(j.name) : undefined }
    else if (p.q) priceRef = { q: String(p.q), game: p.game ? String(p.game) : undefined }
  }
  return {
    name: typeof j.name === 'string' ? j.name : undefined,
    image: typeof j.image === 'string' && /^(https?:|ipfs:)/.test(j.image) && !j.image.includes('<') ? j.image : undefined,
    setName: attr('Set'),
    localId: attr('Card No.'),
    officialRarity: attr('Official Rarity'),
    tier: attr('Tier') ?? attr('Rarity'),
    tcgdexId: typeof j.tcgdexId === 'string' ? j.tcgdexId : undefined,
    lang: typeof j.lang === 'string' ? j.lang : undefined,
    hue: typeof j.hue === 'number' ? j.hue : undefined,
    priceRef,
  }
}
