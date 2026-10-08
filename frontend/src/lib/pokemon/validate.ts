import { DEFAULT_REWARD_SUPPLY, POOL_SIZE, RECOMMENDED_COMPOSITION, TIER_NAMES, TIER_ODDS, type Tier } from './tiers'
import type { PoolCard } from './types'

export type CheckItem = { id: string; ok: boolean; label: string; hint?: string }

export type DraftInput = {
  pool: PoolCard[]
  reward: PoolCard | null
  setName: string
  priceEth: string
  packs: string
  rewardSupply: string
  /** wallet state */
  connected: boolean
  isAdmin: boolean
  rightNetwork: boolean
}

const TIERS: Tier[] = [0, 1, 2, 3]
export const tierCounts = (pool: PoolCard[]): Record<Tier, number> => {
  const c: Record<Tier, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const p of pool) if (p.tier != null) c[p.tier]++
  return c
}

const isPosInt = (s: string | number) => /^\d+$/.test(String(s).trim()) && Number(s) > 0
export const isPositiveDecimal = (s: string) => /^\d+(\.\d{1,18})?$/.test(s.trim()) && Number(s) > 0

/** Spec v2 §3 pre-publish checklist plus the numeric fields of the form. */
export function validateDraft(d: DraftInput): CheckItem[] {
  const counts = tierCounts(d.pool)
  const missing = TIERS.filter((t) => counts[t] === 0).map((t) => TIER_NAMES[t])
  const unassigned = d.pool.filter((p) => p.tier == null).length
  const badSupply = d.pool.filter((p) => !Number.isInteger(p.maxSupply) || p.maxSupply <= 0).length
  const reward = d.reward
  const dup = reward ? d.pool.some((p) => p.key === reward.key || (p.tcgdexId && p.tcgdexId === reward.tcgdexId)) : false
  const items: CheckItem[] = [
    { id: 'size', ok: d.pool.length === POOL_SIZE, label: `${POOL_SIZE} cards in the pool (${d.pool.length}/${POOL_SIZE})` },
    {
      id: 'tiers', ok: d.pool.length > 0 && missing.length === 0 && unassigned === 0, label: 'Every tier has at least one card',
      hint: unassigned ? `${unassigned} card(s) without a tier` : missing.length ? `Missing: ${missing.join(', ')}` : undefined,
    },
    {
      id: 'supply', ok: d.pool.length > 0 && unassigned === 0 && badSupply === 0, label: 'Every card has a tier and maxSupply > 0',
      hint: badSupply ? `${badSupply} card(s) with an invalid maxSupply` : undefined,
    },
    {
      id: 'reward', ok: !!reward && !dup, label: 'Reward card chosen and not in the pool',
      hint: !reward ? 'No reward card chosen' : dup ? 'The reward card is also in the pool' : undefined,
    },
    {
      id: 'form', ok: d.setName.trim().length > 0 && isPositiveDecimal(d.priceEth) && isPosInt(d.packs) && isPosInt(d.rewardSupply),
      label: 'Valid set name, pack price, pack count and reward supply',
    },
    {
      id: 'wallet', ok: d.connected && d.isAdmin && d.rightNetwork, label: 'Admin wallet connected on Sepolia',
      hint: !d.connected ? 'No wallet connected' : !d.isAdmin ? 'This wallet lacks ADMIN_ROLE' : !d.rightNetwork ? 'Wrong network' : undefined,
    },
  ]
  return items
}

export type Preview = {
  counts: Record<Tier, number>
  rows: { tier: Tier; name: string; count: number; slotOdds: number; perCard: number | null }[]
  warnings: string[]
}

/** Draw preview. Slots 1–4 use 60/28/10/2; slot 5 draws from Rare+ (70/25/5) — see PackSale. */
export function previewPool(pool: PoolCard[], reward?: PoolCard | null): Preview {
  const counts = tierCounts(pool)
  const rows = TIERS.map((t) => ({
    tier: t, name: TIER_NAMES[t], count: counts[t], slotOdds: TIER_ODDS[t], perCard: counts[t] ? TIER_ODDS[t] / counts[t] : null,
  }))
  const warnings: string[] = []
  if (pool.length) {
    if (counts[0] === 0) warnings.push('The Common tier is empty: packs cannot mint (at least one Common card is required).')
    for (const t of [1, 2, 3] as Tier[]) {
      if (counts[t] === 0) warnings.push(`The ${TIER_NAMES[t]} tier has no cards: ${TIER_NAMES[t]} draws (${TIER_ODDS[t]}%) fall to the next tier below.`)
    }
    const off = TIERS.filter((t) => counts[t] !== RECOMMENDED_COMPOSITION[t])
    if (off.length && pool.length === POOL_SIZE && TIERS.every((t) => counts[t] > 0)) {
      warnings.push(`The recommended mix is ${TIERS.map((t) => RECOMMENDED_COMPOSITION[t]).join('/')} (Common/Rare/Epic/Legendary); you have ${TIERS.map((t) => counts[t]).join('/')}.`)
    }
    const inferred = pool.filter((p) => p.tierSource === 'inferred').length
    if (inferred) warnings.push(`${inferred} card(s) have a tier inferred outside the spec's mapping table — please review.`)
    const sets = new Set(pool.filter((p) => !p.custom).map((p) => `${p.lang}:${p.setId}`))
    if (sets.size > 1) warnings.push(`The pool mixes ${sets.size} different Pokémon sets; the spec asks for 11 cards from a single set.`)
    if (reward && !reward.custom && sets.size === 1 && !sets.has(`${reward.lang}:${reward.setId}`)) warnings.push('The reward card comes from a different Pokémon set than the pool.')
    const custom = pool.filter((p) => p.custom).length
    if (custom) warnings.push(`${custom} hand-entered card(s): no TCGdex data and no reference price.`)
  }
  return { counts, rows, warnings }
}

export { DEFAULT_REWARD_SUPPLY }
