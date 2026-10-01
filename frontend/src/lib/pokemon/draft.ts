import { DEFAULT_REWARD_SUPPLY } from './tiers'
import type { PoolCard } from './types'
import type { RunState } from './publish'

// The Pack Builder keeps its draft (and an unfinished publish) in localStorage so a reload does not lose the admin's picks.

export type Draft = {
  lang: string
  setId: string
  pool: PoolCard[]
  reward: PoolCard | null
  setName: string
  priceEth: string
  packs: string
  rewardSupply: string
}

export const DRAFT_KEY = 'tc.packbuilder.draft.v2'
export const RUN_KEY = 'tc.packbuilder.run.v2'

export const emptyDraft = (): Draft => ({
  lang: 'en', setId: '', pool: [], reward: null, setName: '', priceEth: '0.01', packs: '1000', rewardSupply: String(DEFAULT_REWARD_SUPPLY),
})

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browserStore = (): Store | null => {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

const isCard = (c: unknown): c is PoolCard => !!c && typeof c === 'object' && typeof (c as PoolCard).key === 'string' && typeof (c as PoolCard).name === 'string' && typeof (c as PoolCard).maxSupply === 'number'

export function loadDraft(store: Store | null = browserStore()): Draft {
  const base = emptyDraft()
  try {
    const j = JSON.parse(store?.getItem(DRAFT_KEY) || 'null')
    if (!j || typeof j !== 'object') return base
    return {
      lang: typeof j.lang === 'string' ? j.lang : base.lang,
      setId: typeof j.setId === 'string' ? j.setId : '',
      pool: Array.isArray(j.pool) ? j.pool.filter(isCard) : [],
      reward: isCard(j.reward) ? j.reward : null,
      setName: typeof j.setName === 'string' ? j.setName : '',
      priceEth: typeof j.priceEth === 'string' ? j.priceEth : base.priceEth,
      packs: typeof j.packs === 'string' ? j.packs : base.packs,
      rewardSupply: typeof j.rewardSupply === 'string' ? j.rewardSupply : base.rewardSupply,
    }
  } catch {
    return base
  }
}
export function saveDraft(d: Draft, store: Store | null = browserStore()) {
  try { store?.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* quota / private mode: the draft just is not persisted */ }
}
export function clearDraft(store: Store | null = browserStore()) {
  try { store?.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

export function loadRun(store: Store | null = browserStore()): RunState | null {
  try {
    const j = JSON.parse(store?.getItem(RUN_KEY) || 'null')
    if (j && Array.isArray(j.done)) return j as RunState
  } catch { /* ignore */ }
  return null
}
export function saveRun(r: RunState | null, store: Store | null = browserStore()) {
  try {
    if (r && r.done.length) store?.setItem(RUN_KEY, JSON.stringify(r))
    else store?.removeItem(RUN_KEY)
  } catch { /* ignore */ }
}
