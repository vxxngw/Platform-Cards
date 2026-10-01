// Spec v2 §2 — maps the official Pokémon TCG rarity (as TCGdex spells it) to the 4 on-chain tiers.

export type Tier = 0 | 1 | 2 | 3
export const TIER_NAMES = ['Common', 'Rare', 'Epic', 'Legendary'] as const

/** Default maxSupply per tier (spec v1 §2 table). */
export const DEFAULT_MAX_SUPPLY: Record<Tier, number> = { 0: 10_000, 1: 3_000, 2: 800, 3: 100 }
/** Draw odds per pack slot, in percent (spec v1 §2): Common / Rare / Epic / Legendary. */
export const TIER_ODDS: Record<Tier, number> = { 0: 60, 1: 28, 2: 10, 3: 2 }
/** Recommended pool composition (Common/Rare/Epic/Legendary) and the required pool size. */
export const RECOMMENDED_COMPOSITION: Record<Tier, number> = { 0: 5, 1: 3, 2: 2, 3: 1 }
export const POOL_SIZE = 11
export const DEFAULT_REWARD_SUPPLY = 50

export type TierSource = 'table' | 'inferred' | 'manual'
export type TierSuggestion = { tier: Tier; source: 'table' | 'inferred' }

// The table from the spec, matched case-insensitively (TCGdex writes "Double rare", "Special illustration rare", …).
const TABLE: Record<string, Tier> = {
  common: 0,
  uncommon: 0,
  rare: 1,
  'rare holo': 1,
  'double rare': 1,
  'ultra rare': 2,
  'illustration rare': 2,
  'special illustration rare': 3,
  'hyper rare': 3,
  'secret rare': 3,
}

// Values outside the spec table that are unambiguous equivalents. They are pre-filled but flagged "inferred" in the UI so the
// admin can review them. Everything else (Promo, None, ACE SPEC Rare, Pocket diamonds/stars, …) has to be assigned by hand.
const INFERRED: Record<string, Tier> = {
  'holo rare': 1,
  'rare holo lv.x': 1,
  'rare prime': 1,
  'holo rare v': 2,
  'holo rare vmax': 2,
  'holo rare vstar': 2,
  'radiant rare': 2,
  'shiny ultra rare': 2,
  'mega hyper rare': 3,
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export function suggestTier(official: string | null | undefined): TierSuggestion | null {
  if (!official) return null
  const k = norm(official)
  if (k in TABLE) return { tier: TABLE[k], source: 'table' }
  if (k in INFERRED) return { tier: INFERRED[k], source: 'inferred' }
  return null
}
