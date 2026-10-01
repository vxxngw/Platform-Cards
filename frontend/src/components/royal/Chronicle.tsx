import { Coins, Crown, Gem, Package, ScrollText, Sparkles, Store, Undo2, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { describeEvent, type EventKind } from '@/lib/activity'
import { timeAgo, type ChainEvent } from '@/lib/tc'
import { txUrl } from '@/lib/chain/config'
import { useEvents } from '@/lib/hooks'
import { Frame } from './Ornaments'

export const KIND_ICON: Record<EventKind, LucideIcon> = {
  pack: Package, open: Wand2, pull: Sparkles, list: Store, sale: Gem, cancel: Undo2, reward: Crown, admin: ScrollText, coin: Coins,
}

export function EventRow({ e, me }: { e: ChainEvent; me?: string | null }) {
  const d = describeEvent(e, me)
  const Icon = KIND_ICON[d.kind]
  const url = txUrl(e.txHash)
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-snug text-ivory">{d.text}</div>
        <div className="mt-0.5 flex items-center gap-2 font-display text-[10px] tracking-[0.14em] text-fg-muted">
          <span>{e.name.toUpperCase()}</span>
          <span>·</span>
          <span className="tracking-normal">{timeAgo(e.at)}</span>
          {url && <><span>·</span><a href={url} target="_blank" rel="noreferrer" className="tracking-normal text-gold/80 hover:text-gold-bright">Etherscan ↗</a></>}
        </div>
      </div>
    </div>
  )
}

/** The global ledger: latest events of all three contracts. */
export function Chronicle({ limit = 10, title = 'Royal Chronicle' }: { limit?: number; title?: string }) {
  const ev = useEvents(limit)
  return (
    <Frame className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-gold/15 px-4 py-3">
        <span className="font-display text-sm font-bold tracking-[0.14em] text-gold-bright">{title.toUpperCase()}</span>
        <span className="font-display text-[10px] tracking-[0.14em] text-fg-muted">LIVE · REFRESHES EVERY 30S</span>
      </div>
      <div className="divide-y divide-gold/10">
        {(ev.data || []).map((e) => <EventRow key={e.id} e={e} />)}
        {ev.isLoading && <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
        {ev.data && ev.data.length === 0 && <div className="px-4 py-8 text-center text-fg-muted">The chronicle is still unwritten.</div>}
        {ev.error && <div className="px-4 py-8 text-center text-fg-muted">The chronicle could not be read from the chain right now.</div>}
      </div>
    </Frame>
  )
}
