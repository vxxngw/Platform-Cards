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

/** Spec v2 §3 "Kiểm tra trước khi cho bấm Phát hành" plus the numeric fields of the form. */
export function validateDraft(d: DraftInput): CheckItem[] {
  const counts = tierCounts(d.pool)
  const missing = TIERS.filter((t) => counts[t] === 0).map((t) => TIER_NAMES[t])
  const unassigned = d.pool.filter((p) => p.tier == null).length
  const badSupply = d.pool.filter((p) => !Number.isInteger(p.maxSupply) || p.maxSupply <= 0).length
  const reward = d.reward
  const dup = reward ? d.pool.some((p) => p.key === reward.key || (p.tcgdexId && p.tcgdexId === reward.tcgdexId)) : false
  const items: CheckItem[] = [
    { id: 'size', ok: d.pool.length === POOL_SIZE, label: `Đủ ${POOL_SIZE} thẻ trong pack (${d.pool.length}/${POOL_SIZE})` },
    {
      id: 'tiers', ok: d.pool.length > 0 && missing.length === 0 && unassigned === 0, label: 'Mỗi bậc có ít nhất 1 thẻ',
      hint: unassigned ? `${unassigned} thẻ chưa có bậc` : missing.length ? `Thiếu: ${missing.join(', ')}` : undefined,
    },
    {
      id: 'supply', ok: d.pool.length > 0 && unassigned === 0 && badSupply === 0, label: 'Mọi thẻ đã có bậc và maxSupply > 0',
      hint: badSupply ? `${badSupply} thẻ có maxSupply không hợp lệ` : undefined,
    },
    {
      id: 'reward', ok: !!reward && !dup, label: 'Đã chọn thẻ thưởng, không trùng thẻ trong pool',
      hint: !reward ? 'Chưa chọn thẻ thưởng' : dup ? 'Thẻ thưởng đang nằm trong pool' : undefined,
    },
    {
      id: 'form', ok: d.setName.trim().length > 0 && isPositiveDecimal(d.priceEth) && isPosInt(d.packs) && isPosInt(d.rewardSupply),
      label: 'Tên bộ, giá pack, tổng số pack, supply thẻ thưởng hợp lệ',
    },
    {
      id: 'wallet', ok: d.connected && d.isAdmin && d.rightNetwork, label: 'Ví Admin đã kết nối, đúng mạng Sepolia',
      hint: !d.connected ? 'Chưa kết nối ví' : !d.isAdmin ? 'Ví này không có ADMIN_ROLE' : !d.rightNetwork ? 'Sai mạng' : undefined,
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
    if (counts[0] === 0) warnings.push('Bậc Common trống: pack không mint được (cần ít nhất 1 thẻ Common).')
    for (const t of [1, 2, 3] as Tier[]) {
      if (counts[t] === 0) warnings.push(`Bậc ${TIER_NAMES[t]} không có thẻ: lượt rút ${TIER_NAMES[t]} (${TIER_ODDS[t]}%) rơi xuống bậc thấp hơn kế tiếp.`)
    }
    const off = TIERS.filter((t) => counts[t] !== RECOMMENDED_COMPOSITION[t])
    if (off.length && pool.length === POOL_SIZE && TIERS.every((t) => counts[t] > 0)) {
      warnings.push(`Cơ cấu khuyến nghị là ${TIERS.map((t) => RECOMMENDED_COMPOSITION[t]).join('/')} (Common/Rare/Epic/Legendary); bạn đang dùng ${TIERS.map((t) => counts[t]).join('/')}.`)
    }
    const inferred = pool.filter((p) => p.tierSource === 'inferred').length
    if (inferred) warnings.push(`${inferred} thẻ có bậc được suy ra ngoài bảng quy đổi của spec — hãy xem lại.`)
    const sets = new Set(pool.filter((p) => !p.custom).map((p) => `${p.lang}:${p.setId}`))
    if (sets.size > 1) warnings.push(`Pool lấy từ ${sets.size} set Pokémon khác nhau; spec yêu cầu 11 thẻ từ một set.`)
    if (reward && !reward.custom && sets.size === 1 && !sets.has(`${reward.lang}:${reward.setId}`)) warnings.push('Thẻ thưởng thuộc set Pokémon khác với pool.')
    const custom = pool.filter((p) => p.custom).length
    if (custom) warnings.push(`${custom} thẻ nhập tay: không có dữ liệu TCGdex và không có giá tham chiếu.`)
  }
  return { counts, rows, warnings }
}

export { DEFAULT_REWARD_SUPPLY }
