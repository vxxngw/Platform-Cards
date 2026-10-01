import { Button } from '@/components/ui/button'
import { fmtEth, fmtUsd, type CardSet } from '@/lib/tc'
import { useEthUsd } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { Frame } from './Ornaments'
import { PackArt } from './PackArt'

/** A pack on the shelf: art, name, price, stock and the way in. */
export function PackTile({ set, owned = 0, onQuickBuy, busy }: { set: CardSet; owned?: number; onQuickBuy?: () => void; busy?: boolean }) {
  const ethUsd = useEthUsd()
  const p = set.pack
  const sold = p ? p.total - p.remaining : 0
  const pct = p ? Math.round((sold / Math.max(1, p.total)) * 100) : 0
  const reward = set.cards.find((c) => c.isReward)
  const cards = set.cards.filter((c) => !c.isReward).length
  return (
    <Frame className="group flex flex-col p-5 transition hover:border-gold/50">
      <Link to={`/gacha/${set.id}`} className="mx-auto block w-[62%] max-w-[210px] transition duration-500 group-hover:-translate-y-1.5 group-hover:drop-shadow-[0_18px_30px_rgba(214,171,82,.25)]">
        <PackArt set={set} count={owned} />
      </Link>
      <div className="mt-5 flex items-start justify-between gap-2">
        <Link to={`/gacha/${set.id}`} className="min-w-0">
          <h3 className="truncate text-lg font-bold text-ivory transition group-hover:text-gold-bright">{set.name}</h3>
          <div className="text-sm text-fg-muted">{cards} cards · reward <span className="text-gold">{reward?.name ?? '—'}</span></div>
        </Link>
        {p?.onSale
          ? <span className="shrink-0 rounded-sm border border-emerald/50 bg-emerald/15 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.18em] text-[#6fe0b3]">ON SALE</span>
          : <span className="shrink-0 rounded-sm border border-fg-muted/40 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.18em] text-fg-muted">CLOSED</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold text-gold-bright">{p ? fmtEth(p.price) : '—'}</span>
        <span className="font-display text-xs tracking-widest text-fg-subtle">ETH / PACK</span>
        {p && ethUsd && <span className="ml-auto text-xs text-fg-muted">≈ {fmtUsd(Number(p.price) * ethUsd)}</span>}
      </div>
      {p && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-night ring-1 ring-gold/20">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#8f6a22,#f6dc95)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-fg-muted"><span>{sold.toLocaleString()} sold</span><span>{p.remaining.toLocaleString()} left</span></div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm"><a href={`#/gacha/${set.id}`}>View pool</a></Button>
        {onQuickBuy
          ? <Button size="sm" disabled={busy || !p?.onSale || !p?.remaining} onClick={onQuickBuy}>{busy ? 'Summoning…' : 'Buy & open'}</Button>
          : <Button asChild size="sm"><a href={`#/gacha/${set.id}`}>Buy packs</a></Button>}
      </div>
    </Frame>
  )
}
