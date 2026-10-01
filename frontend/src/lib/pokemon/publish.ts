import { http, sendTx } from '../tc'
import { signMessage } from '../chain/adapter'
import { buildMetadataFolder, orderPool } from './metadata'
import { pinMetadata } from './pin'
import type { PoolCard } from './types'

// Spec v2 §3 step 6: build JSON → /api/pin → createSet → (setBaseURI) → configurePack.
// The deployed CardCollection has one global base URI, so a publish also moves it to the new folder (see buildMetadataFolder).

export type StepId = 'prepare' | 'pin' | 'create' | 'baseuri' | 'pack'
export const STEPS: { id: StepId; label: string }[] = [
  { id: 'prepare', label: 'Sinh JSON metadata (gộp các thẻ cũ)' },
  { id: 'pin', label: 'Pin metadata (ký tin nhắn, không tốn gas)' },
  { id: 'create', label: 'createSet(…) — giao dịch 1' },
  { id: 'baseuri', label: 'setBaseURI(…) — giao dịch 2' },
  { id: 'pack', label: 'configurePack(…) — giao dịch 3, mở bán' },
]
export type StepStatus = 'idle' | 'running' | 'done' | 'error'

export type PublishInput = {
  address: string
  pool: PoolCard[]
  reward: PoolCard
  setName: string
  rewardSupply: number
  priceEth: string
  packs: number
}

export type BuilderContext = { nextCardId: number; nextSetId: number; currentBaseUri: string; existing: Record<number, unknown>; missing: number[] }
export const loadContext = () => http<BuilderContext>('tc/builder/context')

/** Everything a later step (or a retry after a failure/reload) needs from the earlier ones. */
export type RunState = {
  firstCardId?: number
  baseUri?: string
  pinMode?: 'pinata'
  cid?: string
  setId?: number
  done: StepId[]
}

type Hooks = { onStep: (id: StepId, status: StepStatus, detail?: string) => void; onState: (s: RunState) => void }

/**
 * Runs the publish pipeline from the first step that is not in `state.done`. Throws on the first failure after marking the
 * step as `error`; calling it again resumes from that step (finished steps are never repeated).
 */
export async function runPublish(input: PublishInput, state: RunState, hooks: Hooks): Promise<RunState> {
  const st: RunState = { ...state, done: [...state.done] }
  // the JSON is only kept in memory: until it has been pinned, regenerate it (cheap, and it re-reads the next free token id)
  if (!st.done.includes('pin')) st.done = st.done.filter((d) => d !== 'prepare')
  const ordered = orderPool(input.pool)
  const finish = (id: StepId, detail?: string) => { st.done.push(id); hooks.onStep(id, 'done', detail); hooks.onState({ ...st, done: [...st.done] }) }
  const step = async (id: StepId, fn: () => Promise<string | void>) => {
    if (st.done.includes(id)) { hooks.onStep(id, 'done'); return }
    hooks.onStep(id, 'running')
    try {
      finish(id, (await fn()) || undefined)
    } catch (e) {
      hooks.onStep(id, 'error', (e as Error).message)
      throw e
    }
  }

  let files: Record<string, unknown> = {}
  await step('prepare', async () => {
    const ctx = await loadContext()
    st.firstCardId = ctx.nextCardId
    files = buildMetadataFolder({ firstCardId: ctx.nextCardId, pool: ordered, reward: input.reward, existing: ctx.existing })
    return `${Object.keys(files).length} file · thẻ mới từ id #${ctx.nextCardId}`
  })

  await step('pin', async () => {
    const out = await pinMetadata(files, input.address, (m) => signMessage(input.address, m))
    st.baseUri = out.baseUri
    st.pinMode = out.mode
    st.cid = out.cid
    return out.mode === 'pinata' ? `IPFS ${out.baseUri}` : `Lưu trên máy chủ ứng dụng · ${out.baseUri}`
  })

  await step('create', async () => {
    // ids were fixed when the JSON was generated: make sure nobody created a set in between
    const ctx = await loadContext()
    if (ctx.nextCardId !== st.firstCardId) throw new Error(`Id thẻ tiếp theo đã đổi (${st.firstCardId} → ${ctx.nextCardId}); hãy bắt đầu lại để sinh lại metadata.`)
    const out = await sendTx<{ tx: string; setId: number; cardIds: number[]; rewardCardId: number }>(`createSet “${input.setName}”`, 'tc/sets', {
      name: input.setName,
      cards: ordered.map((c) => ({ rarity: c.tier, maxSupply: c.maxSupply })),
      rewardMaxSupply: input.rewardSupply,
    })
    const want = ordered.map((_, i) => st.firstCardId! + i)
    if (out.cardIds.join() !== want.join() || out.rewardCardId !== st.firstCardId! + ordered.length) {
      throw new Error('Id thẻ on-chain không khớp metadata đã pin — dừng lại, đừng mở bán set này.')
    }
    st.setId = out.setId
    return `setId #${out.setId}`
  })

  await step('baseuri', async () => {
    const ctx = await loadContext()
    if (ctx.currentBaseUri === st.baseUri) return 'base URI đã đúng'
    await sendTx('setBaseURI', 'tc/admin/baseuri', { uri: st.baseUri })
  })

  await step('pack', async () => {
    await sendTx(`configurePack bộ #${st.setId}`, `tc/sets/${st.setId}/pack`, { price: input.priceEth, supply: input.packs, onSale: true })
  })
  return st
}
