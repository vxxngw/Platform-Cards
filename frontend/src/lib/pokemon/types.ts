import type { Tier, TierSource } from './tiers'

// ---- TCGdex REST shapes (only the fields the Pack Builder reads) ----
export type TcgdexCardCount = { total: number; official: number }
export type TcgdexSetBrief = { id: string; name: string; logo?: string; symbol?: string; cardCount: TcgdexCardCount }
export type TcgdexCardBrief = { id: string; localId: string; name: string; image?: string }
export type TcgdexSet = {
  id: string
  name: string
  logo?: string
  symbol?: string
  releaseDate?: string
  serie?: { id: string; name: string }
  cardCount: TcgdexCardCount
  cards: TcgdexCardBrief[]
}
export type TcgdexCard = {
  id: string
  localId: string
  name: string
  image?: string
  category?: string
  rarity?: string
  illustrator?: string
  set: { id: string; name: string; cardCount?: TcgdexCardCount }
}

/** One card in the Pack Builder (a pool card or the reward card). */
export type PoolCard = {
  /** Unique within the draft: `${lang}:${tcgdexId}` or `custom:<n>`. */
  key: string
  /** TCGdex card id such as `sv03.5-199` ('' for hand-entered cards). */
  tcgdexId: string
  lang: string
  setId: string
  setName: string
  localId: string
  name: string
  /** TCGdex image base URL (no extension) or a full image URL; null if there is none. */
  image: string | null
  officialRarity: string | null
  tier: Tier | null
  tierSource: TierSource | null
  maxSupply: number
  custom: boolean
  variation: string
}

/** Card metadata as stored on IPFS (spec v2 §4) — a snapshot taken when the set is published. */
export type CardMetadata = {
  name: string
  description: string
  image?: string
  attributes: { trait_type: string; value: string | number }[]
  source: 'tcgdex' | 'custom'
  tcgdexId?: string
  lang?: string
  priceRef?: { set_name: string; item_no: string; variation: string; language: string; card_name?: string }
}
