import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { connectNewWallet } from '@/components/tc/Shell'
import { PoolPanel } from '@/components/pb/PoolPanel'
import { PublishPanel, type WalletInfo } from '@/components/pb/PublishPanel'
import { SourcePanel, type PickMode } from '@/components/pb/SourcePanel'
import { useWalletStore } from '@/lib/tc'
import { useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { CHAIN_ID } from '@/lib/chain/config'
import { initChainWallet, useWalletChainId } from '@/lib/chain/wallet'
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

  useEffect(() => { initChainWallet() }, [])
  useEffect(() => { saveDraft(draft) }, [draft])

  const ctx = useQuery({ queryKey: ['builder-ctx', current], queryFn: loadContext, enabled: isAdmin, staleTime: 20_000, retry: 1 })
  const pin = useQuery({ queryKey: ['pin-status'], queryFn: pinStatus, staleTime: 60_000 })

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const poolKeys = new Set(draft.pool.map((c) => c.key))

  function onPick(card: PoolCard) {
    if (mode === 'pool') {
      if (poolKeys.has(card.key)) return patch({ pool: draft.pool.filter((c) => c.key !== card.key) }) // click again to remove
      if (draft.reward?.key === card.key) return void toast.error('Thẻ này đang là thẻ thưởng', { description: 'Thẻ thưởng không được nằm trong pool.' })
      if (draft.pool.length >= POOL_SIZE) return void toast.error(`Pool đã đủ ${POOL_SIZE} thẻ`, { description: 'Bỏ bớt một thẻ trước khi thêm.' })
      return patch({ pool: [...draft.pool, card], setName: draft.setName || defaultSetName(card) })
    }
    if (poolKeys.has(card.key)) return void toast.error('Thẻ này đang nằm trong pool', { description: 'Thẻ thưởng không được trùng thẻ trong pool.' })
    if (draft.reward?.key === card.key) return patch({ reward: null })
    patch({ reward: card, setName: draft.setName || defaultSetName(card) })
  }

  function onAddCustom(card: PoolCard, as: 'pool' | 'reward') {
    if (as === 'reward') return patch({ reward: card })
    if (draft.pool.length >= POOL_SIZE) return void toast.error(`Pool đã đủ ${POOL_SIZE} thẻ`)
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
          Chọn 11 thẻ Pokémon TCG từ TCGdex theo cơ cấu 5/3/2/1 (Common/Rare/Epic/Legendary) và 1 thẻ thưởng, rồi phát hành set và pack chỉ trong vài phút. Tên, số thẻ, ảnh và độ hiếm tự điền; bậc on-chain quy đổi tự động.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <SourcePanel
          lang={draft.lang} setLang={(lang) => patch({ lang })} setId={draft.setId} setSetId={(setId) => patch({ setId })}
          poolKeys={poolKeys} rewardKey={draft.reward?.key ?? null} mode={mode} setMode={setMode} onPick={onPick}
        />
        <div className="space-y-5">
          <PoolPanel
            pool={draft.pool} reward={draft.reward} lang={draft.lang}
            onChangeCard={(key, p) => patch({ pool: draft.pool.map((c) => (c.key === key ? { ...c, ...p } : c)) })}
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
        <div className="text-lg font-semibold">Kết nối ví Admin để dùng Pack Builder</div>
        <Button className="mt-4" onClick={() => connectNewWallet().then(refresh).catch(() => {})}>Kết nối ví</Button>
      </div>
    )
  }
  if (me.isLoading || !me.data) return <Skeleton className="h-96 rounded-xl" />
  if (!me.data.wallet?.isAdmin) {
    return <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center text-sm text-fg-subtle">Trang này chỉ dành cho ví có ADMIN_ROLE. Ví hiện tại không có quyền.</div>
  }
  return <Builder />
}
