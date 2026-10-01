import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace, RarityBadge } from '@/components/tc/CardFace'
import { CardDialog, RefPrice } from '@/components/tc/CardDialog'
import { EmptyState, Frame, PageHero, Stat } from '@/components/royal/Ornaments'
import { PRICE_REF_ENABLED } from '@/lib/features'
import { connectNewWallet } from '@/components/tc/Shell'
import { http, sendTx, fmtEth, fmtUsd, short, timeAgo, RARITY_NAMES, useWalletStore, type Card, type Listing } from '@/lib/tc'
import { useConfig, useEthUsd, useMe, useRefresh, useSets } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type Stats = { sales: number; volume: string; activeListings: number }

function ListingCard({ l, onOpenCard }: { l: Listing; onOpenCard: (c: Card) => void }) {
  const { current } = useWalletStore()
  const me = useMe()
  const ethUsd = useEthUsd()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const mine = !!current && l.seller.toLowerCase() === current.toLowerCase()
  const price = Number(l.price)
  const balance = Number(me.data?.wallet?.balance || 0)
  const first = l.items[0]
  const card = first?.card

  async function act(kind: 'buy' | 'cancel') {
    setBusy(true)
    try {
      await sendTx(kind === 'buy' ? `Buy listing #${l.listingId}` : `Cancel listing #${l.listingId}`, `tc/listings/${l.listingId}/${kind}`)
      refresh()
    } catch { /* toast shown */ } finally { setBusy(false) }
  }

  return (
    <Frame corners={false} className={cn('flex h-full flex-col p-3 transition hover:border-gold/50', l.isBundle && 'royal-panel-strong')}>
      {l.isBundle ? (
        <div className="relative">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {l.items.slice(0, 12).map((it, i) => it.card && <CardFace key={i} card={it.card} compact onClick={() => onOpenCard(it.card!)} />)}
          </div>
          <span className="absolute -left-1 -top-1 rounded-sm border border-gold-deep bg-[linear-gradient(180deg,#f6dc95,#d6ab52)] px-1.5 py-0.5 font-display text-[9px] font-black tracking-[0.16em] text-primary-foreground">FULL SET · {l.items.length} CARDS</span>
        </div>
      ) : card ? (
        <div className="mx-auto w-full max-w-[170px]"><CardFace card={card} count={first.amount} onClick={() => onOpenCard(card)} /></div>
      ) : null}
      <div className="mt-3 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-display text-[15px] font-bold text-ivory">{l.isBundle ? l.setName : card?.name}</span>
          {!l.isBundle && card && <RarityBadge rarity={card.rarity} />}
        </div>
        {!l.isBundle && card?.officialRarity && (
          <div className="truncate text-xs text-fg-muted">{card.officialRarity}{card.localId ? ` · #${card.localId}` : ''}{card.setName ? ` · ${card.setName}` : ''}</div>
        )}
        <div className="text-xs text-fg-muted">#{l.listingId} · {mine ? 'your listing' : `by ${short(l.seller)}`} · {timeAgo(l.createdAt)}</div>
        <div className="flex items-baseline gap-1.5 pt-1">
          <span className="font-display text-xl font-bold text-gold-bright">{fmtEth(l.price, 6)}</span><span className="font-display text-xs tracking-widest text-fg-subtle">ETH</span>
          {ethUsd && <span className="ml-auto text-xs text-fg-muted">≈ {fmtUsd(price * ethUsd)}</span>}
        </div>
        {!l.isBundle && first.amount > 1 && <div className="text-xs text-fg-muted">{first.amount} copies · {fmtEth(price / first.amount, 6)} ETH each</div>}
        {!l.isBundle && card?.priceRef && <RefPrice card={card} compact />}
      </div>
      <div className="mt-3">
        {!current ? <Button size="sm" variant="outline" className="w-full" onClick={() => connectNewWallet().then(refresh).catch(() => {})}>Connect to buy</Button>
          : mine ? <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => act('cancel')}>{busy ? 'Withdrawing…' : 'Cancel listing'}</Button>
          : <Button size="sm" className="w-full" disabled={busy || balance < price} onClick={() => act('buy')}>{busy ? 'Buying…' : balance < price ? 'Not enough ETH' : 'Buy now'}</Button>}
      </div>
    </Frame>
  )
}

const SELECT = 'royal-input min-w-0'

export default function Market({ initialSet }: { initialSet?: string }) {
  const sets = useSets()
  const cfg = useConfig()
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => http<Stats>('tc/stats'), refetchInterval: 30000 })
  const [f, setF] = useState({ setId: initialSet || '', rarity: '', kind: '', min: '', max: '', sort: 'newest', mine: false })
  const { current } = useWalletStore()
  const [card, setCard] = useState<Card | null>(null)
  const params = new URLSearchParams({ setId: f.setId, rarity: f.rarity, kind: f.kind, min: f.min, max: f.max, sort: f.sort })
  const q = useQuery({ queryKey: ['listings', params.toString()], queryFn: () => http<Listing[]>(`tc/listings?${params}`), refetchInterval: 20000 })
  const list = (q.data || []).filter((l) => !f.mine || (current && l.seller.toLowerCase() === current.toLowerCase()))
  const fee = (cfg.data?.feeBps ?? 250) / 100

  return (
    <div className="space-y-8">
      <PageHero kicker="The Grand Bazaar" title="Marketplace"
        sub={<>Fixed-price trades between collectors. Listed cards wait in the contract's escrow until sold or withdrawn; sellers pay a {fee}% fee and collect proceeds from their Profile.</>}>
        <div className="grid grid-cols-2 gap-6">
          <Stat label="Listed now" value={stats.data?.activeListings?.toLocaleString()} />
          <Stat label="Volume" value={stats.data ? `${fmtEth(stats.data.volume, 3)} ETH` : undefined} />
        </div>
      </PageHero>

      <Frame corners={false} className="flex flex-wrap items-center gap-2 p-3">
        <select className={SELECT} value={f.setId} onChange={(e) => setF({ ...f, setId: e.target.value })} aria-label="Set">
          <option value="">All sets</option>
          {(sets.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={SELECT} value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} aria-label="Rarity">
          <option value="">Any rarity</option>
          {RARITY_NAMES.map((r, i) => <option key={r} value={i}>{r}</option>)}
        </select>
        <select className={SELECT} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Listing type">
          <option value="">Singles & sets</option><option value="single">Single cards</option><option value="bundle">Full sets</option>
        </select>
        <input className={cn(SELECT, 'w-28')} placeholder="Min ETH" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(',', '.') })} />
        <input className={cn(SELECT, 'w-28')} placeholder="Max ETH" inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(',', '.') })} />
        <select className={SELECT} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} aria-label="Sort">
          <option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </select>
        {current && (
          <label className="flex items-center gap-2 px-1 text-sm text-fg-subtle">
            <input type="checkbox" className="accent-[#d6ab52]" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> My listings
          </label>
        )}
        <span className="ml-auto font-display text-xs tracking-[0.14em] text-fg-muted">{list.length} LISTING{list.length === 1 ? '' : 'S'}</span>
      </Frame>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-80 rounded-xl" />)}</div>
      ) : q.error ? (
        <EmptyState title="The bazaar is out of reach" body="Listings could not be read from Sepolia right now. Try again shortly." />
      ) : list.length === 0 ? (
        <EmptyState title="No listings match" body="Open packs, then list your duplicates from Profile → Collection."
          action={<><Button asChild variant="outline"><a href="#/gacha">Open packs</a></Button><Button asChild><a href="#/profile?tab=collection">List my cards</a></Button></>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {list.map((l) => <div key={l.listingId} className={l.isBundle ? 'col-span-2' : ''}><ListingCard l={l} onOpenCard={setCard} /></div>)}
        </div>
      )}
      <p className="text-xs text-fg-muted">
        {PRICE_REF_ENABLED
          ? 'Market reference prices come from Renaiss OS Index for the matching real card, refreshed every 24 hours. They are for reference only and never touch the contracts.'
          : 'Market reference prices from Renaiss OS Index are coming soon. Listing prices are set by sellers and never depend on reference prices.'}
      </p>
      <CardDialog card={card} open={!!card} onOpenChange={(o) => !o && setCard(null)} />
    </div>
  )
}
