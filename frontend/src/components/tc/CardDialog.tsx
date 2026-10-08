import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CardFace, RarityBadge } from './CardFace'
import { http, fmtEth, short, timeAgo, RARITY_ODDS, type Card } from '@/lib/tc'
import { TCGDEX_BASE } from '@/lib/pokemon/tcgdex'
import { PRICE_REF_ENABLED } from '@/lib/features'
import { Divider } from '@/components/royal/Ornaments'
import type { ReactNode } from 'react'

type PriceReply = {
  found: boolean; reason?: string; best_estimate?: number; currency?: string; confidence_tier?: string | null; freshness_days?: number | null
  name?: string | null; setName?: string | null; cardNumber?: string | null; gradeLabel?: string | null; url?: string; error?: string
}

/** Query string for /api/price built from the card's priceRef (set_name + item_no …). */
function priceQuery(card: Card): string | null {
  const p = card.priceRef
  if (p?.set_name && p.item_no) {
    const qs = new URLSearchParams({ set_name: p.set_name, item_no: p.item_no, language: p.language || 'en' })
    if (p.variation) qs.set('variation', p.variation)
    if (p.card_name) qs.set('card_name', p.card_name)
    return qs.toString()
  }
  return null
}

export function RefPrice({ card, compact }: { card: Card; compact?: boolean }) {
  const qs = priceQuery(card)
  const q = useQuery({
    queryKey: ['price', card.id, qs],
    queryFn: () => http<PriceReply>(`price?${qs}`),
    enabled: PRICE_REF_ENABLED && !!qs,
    staleTime: 3600_000, retry: 0,
  })
  const box = compact ? 'rounded-md border border-dashed border-gold/25 px-2 py-1.5 text-[11px]' : 'rounded-lg border border-dashed border-gold/25 p-3 text-xs'
  if (!PRICE_REF_ENABLED) {
    if (!qs) return null // hand-entered cards have no real counterpart to price
    return (
      <div className={`${box} flex items-center justify-between gap-2 text-fg-muted`}>
        <span>{compact ? 'Market reference' : 'Market reference price (Renaiss OS Index)'}</span>
        <span className="rounded-sm border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.16em] text-gold-bright">SOON</span>
      </div>
    )
  }
  const d = q.data
  if (!qs || !d || d.error) return null // loading, API error or quota exhausted: hide the box, never block a trade
  if (!d.found || d.best_estimate == null) {
    return <div className={`${box} text-fg-muted`}>No reference price yet</div>
  }
  const conf = d.confidence_tier ?? '—'
  const graded = d.gradeLabel && !/^raw/i.test(d.gradeLabel)
  return (
    <div className={box}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-fg-muted">Market reference</span>
        <span className="font-display font-bold text-gold-bright">${d.best_estimate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="mt-0.5 text-fg-muted">
        {d.name} · {d.setName} #{d.cardNumber}{d.gradeLabel ? ` · ${d.gradeLabel}` : ''}
      </div>
      <div className="mt-0.5 text-fg-muted">
        Confidence {conf}{d.freshness_days != null ? ` · updated ${d.freshness_days} days ago` : ''}
      </div>
      {graded && !compact && <div className="mt-0.5 text-fg-muted">Price of a graded copy ({d.gradeLabel}), usually above a raw card. For reference only.</div>}
      <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-gold hover:underline">Source: Renaiss OS Index ↗</a>
    </div>
  )
}

type History = {
  card: Card; holders: number
  sales: { txHash: string; at: string; isBundle: boolean; buyer: string; price: string; unitPrice: string | null; amount: number | null }[]
}

export function CardDialog({ card, open, onOpenChange, actions }: {
  card: Card | null; open: boolean; onOpenChange: (o: boolean) => void; actions?: ReactNode
}) {
  const q = useQuery({ queryKey: ['card', card?.id], queryFn: () => http<History>(`tc/cards/${card!.id}`), enabled: !!card && open })
  if (!card) return null
  const c = q.data?.card || card
  const rows: [string, ReactNode][] = [
    ...(c.setName ? [['Pokémon set', c.setName] as [string, ReactNode]] : []),
    ...(c.localId && !c.isReward ? [['Card number', <span className="font-mono">{c.localId}</span>] as [string, ReactNode]] : []),
    ...(c.officialRarity ? [['Official rarity', c.officialRarity] as [string, ReactNode]] : []),
    ['On-chain tier', <span className="font-display font-bold">{c.isReward ? 'Reward' : c.rarityName}</span>],
    ['In circulation', <span className="font-mono">{c.supply.toLocaleString()} / {c.maxSupply.toLocaleString()}</span>],
    ['Burned for rewards', <span className="font-mono">{c.burned.toLocaleString()}</span>],
    ...(c.rarity < 4 ? [['Odds per draw', <span className="font-mono">{RARITY_ODDS[c.rarity]}%</span>] as [string, ReactNode]] : []),
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="kicker">Token #{c.id} · ERC-1155</div>
          <DialogTitle className="flex flex-wrap items-center gap-3 text-2xl">{c.name} <RarityBadge rarity={c.rarity} /></DialogTitle>
          <DialogDescription className="sr-only">Card details and trade history</DialogDescription>
        </DialogHeader>
        <Divider />
        <div className="grid gap-6 sm:grid-cols-[240px_1fr]">
          <div className="space-y-3">
            <CardFace card={c} quality="high" />
            <RefPrice card={c} />
          </div>
          <div className="min-w-0 space-y-5">
            <dl className="divide-y divide-gold/10 rounded-lg border border-gold/15 bg-night/40">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                  <dt className="text-fg-muted">{k}</dt><dd className="text-right text-ivory">{v}</dd>
                </div>
              ))}
            </dl>
            {actions}
            <div>
              <div className="kicker mb-2">Trade history</div>
              {!q.data ? <div className="text-sm text-fg-muted">Reading the ledger…</div> : q.data.sales.length === 0 ? (
                <div className="text-sm text-fg-muted">This card has not changed hands on the Marketplace yet.</div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {q.data.sales.map((s) => (
                    <div key={s.txHash} className="flex items-center justify-between rounded bg-bg-subtle px-2.5 py-1.5 text-sm">
                      <span className="text-fg-muted">{timeAgo(s.at)} · {short(s.buyer)}</span>
                      <span className="font-mono text-ivory">
                        {s.isBundle ? `${fmtEth(s.price)} ETH (full set)` : `${s.amount}× · ${fmtEth(s.unitPrice || s.price, 5)} ETH each`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {c.tcgdexId && (
              <p className="text-xs leading-5 text-fg-muted">
                Academic digital replica of a Pokémon TCG card, not affiliated with Nintendo or The Pokémon Company. Data and image from{' '}
                <a className="text-gold hover:underline" href="https://tcgdex.dev" target="_blank" rel="noreferrer">TCGdex</a>
                {' '}(<a className="text-gold hover:underline" href={`${TCGDEX_BASE}/${c.lang || 'en'}/cards/${c.tcgdexId}`} target="_blank" rel="noreferrer">{c.tcgdexId}</a>).
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
