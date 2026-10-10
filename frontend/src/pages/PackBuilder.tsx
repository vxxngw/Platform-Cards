import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { connectNewWallet } from '@/components/tc/Shell'
import { PoolPanel } from '@/components/pb/PoolPanel'
import { PublishPanel, type WalletInfo } from '@/components/pb/PublishPanel'
import { RepairPanel } from '@/components/pb/RepairPanel'
import { SourcePanel, type PickMode } from '@/components/pb/SourcePanel'
import { useWalletStore } from '@/lib/tc'
import { useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { CHAIN_ID } from '@/lib/chain/config'
import { useWalletChainId } from '@/lib/chain/wallet'
import { loadDraft, saveDraft, type Draft } from '@/lib/pokemon/draft'
import { pinStatus } from '@/lib/pokemon/pin'
import { loadContext } from '@/lib/pokemon/publish'
import { POOL_SIZE } from '@/lib/pokemon/tiers'
import type { PoolCard } from '@/lib/pokemon/types'

const defaultSetName = (c: PoolCard) => (c.custom ? '' : `Pokémon ${c.setName}`)

function Builder() {
  const { current } = useWalletStore()
  const me = useMe()
  const chainId = useWalletChainId()
  const refresh = useRefresh()
  const [draft, setDraft] = useState<Draft>(() => loadDraft())
  const [mode, setMode] = useState<PickMode>('pool')
  const isAdmin = !!me.data?.wallet?.isAdmin

  useEffect(() => { saveDraft(draft) }, [draft])

  const ctx = useQuery({ queryKey: ['builder-ctx', current], queryFn: loadContext, enabled: isAdmin, staleTime: 20_000, retry: 1 })
  const pin = useQuery({ queryKey: ['pin-status'], queryFn: pinStatus, staleTime: 60_000 })

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const poolKeys = new Set(draft.pool.map((c) => c.key))

  function onPick(card: PoolCard) {
    if (mode === 'pool') {
      if (poolKeys.has(card.key)) return patch({ pool: draft.pool.filter((c) => c.key !== card.key) }) // click again to remove
      if (draft.reward?.key === card.key) return void toast.error('This card is the reward card', { description: 'The reward card cannot be in the pool.' })
      if (draft.pool.length >= POOL_SIZE) return void toast.error(`The pool already has ${POOL_SIZE} cards`, { description: 'Remove one before adding another.' })
      return patch({ pool: [...draft.pool, card], setName: draft.setName || defaultSetName(card) })
    }
    if (poolKeys.has(card.key)) return void toast.error('This card is already in the pool', { description: 'The reward card cannot be a pool card.' })
    if (draft.reward?.key === card.key) return patch({ reward: null })
    patch({ reward: card, setName: draft.setName || defaultSetName(card) })
  }

  function onAddCustom(card: PoolCard, as: 'pool' | 'reward') {
    if (as === 'reward') return patch({ reward: card })
    if (draft.pool.length >= POOL_SIZE) return void toast.error(`The pool already has ${POOL_SIZE} cards`)
    patch({ pool: [...draft.pool, card] })
  }

  const wallet: WalletInfo = {
    connected: !!current, address: current, isAdmin, rightNetwork: chainId === CHAIN_ID,
    connect: () => { connectNewWallet().then(refresh).catch(() => {}) },
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-fg-muted"><Link to="/admin" className="hover:text-fg-base">Admin</Link> / Pack Builder</div>
        <h1 className="text-2xl font-black">Pack Builder</h1>
        <p className="max-w-3xl text-sm text-fg-subtle">
          Pick 11 Pokémon TCG cards from TCGdex in a 5/3/2/1 mix (Common/Rare/Epic/Legendary) plus 1 reward card, then publish the set and its packs in minutes. Names, numbers, images and rarities fill in automatically; on-chain tiers are mapped for you.
        </p>
      </div>
      <RepairPanel wallet={wallet} pin={pin.isLoading ? undefined : pin.data ?? null} />
      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <SourcePanel
          lang={draft.lang} setLang={(lang) => patch({ lang })} setId={draft.setId} setSetId={(setId) => patch({ setId })}
          poolKeys={poolKeys} rewardKey={draft.reward?.key ?? null} mode={mode} setMode={setMode} onPick={onPick}
        />
        <div className="space-y-5">
          <PoolPanel
            pool={draft.pool} reward={draft.reward} lang={draft.lang}
            onChangeCard={(key, p) => setDraft((d) => ({ ...d, pool: d.pool.map((c) => (c.key === key ? { ...c, ...p } : c)) }))}
            onChangeReward={(p) => setDraft((d) => ({ ...d, reward: d.reward ? { ...d.reward, ...p } : null }))}
            onRemove={(key) => patch({ pool: draft.pool.filter((c) => c.key !== key) })}
            onClearReward={() => patch({ reward: null })}
            onAddCustom={onAddCustom}
          />
          <PublishPanel
            draft={draft} onChange={patch} wallet={wallet} ctx={ctx.data ?? null} pin={pin.isLoading ? undefined : pin.data ?? null}
            onPublished={() => { patch({ pool: [], reward: null, setName: '' }); refresh() }}
          />
        </div>
      </div>
    </div>
  )
}

export default function PackBuilder() {
  const [mounted, setMounted] = useState(false)
  const { current } = useWalletStore()
  const me = useMe()
  const refresh = useRefresh()
  useEffect(() => setMounted(true), [])

  if (!mounted) return <Skeleton className="h-96 rounded-xl" />
  if (!current) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center">
        <div className="text-lg font-semibold">Connect an admin wallet to use the Pack Builder</div>
        <Button className="mt-4" onClick={() => connectNewWallet().then(refresh).catch(() => {})}>Connect wallet</Button>
      </div>
    )
  }
  if (me.isLoading || !me.data) return <Skeleton className="h-96 rounded-xl" />
  if (!me.data.wallet?.isAdmin) {
    return <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center text-sm text-fg-subtle">This page is for wallets holding ADMIN_ROLE. The connected wallet does not.</div>
  }
  return <Builder />
}
