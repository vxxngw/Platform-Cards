import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CardFace, RarityBadge } from './CardFace'
import { http, fmtEth, short, timeAgo, RARITY_ODDS, type Card } from '@/lib/tc'
import { TCGDEX_BASE } from '@/lib/pokemon/tcgdex'
import { PRICE_REF_ENABLED } from '@/lib/features'
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
  const box = compact ? 'rounded-md border border-dashed border-border px-2 py-1.5 text-[11px]' : 'rounded-lg border border-dashed border-border p-3 text-xs'
  if (!PRICE_REF_ENABLED) {
    if (!qs) return null // hand-entered cards have no real counterpart to price
    return (
      <div className={`${box} flex items-center justify-between gap-2 text-fg-muted`}>
        <span>{compact ? 'Giá tham chiếu' : 'Giá tham chiếu thị trường (Renaiss OS Index)'}</span>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">Sắp ra mắt</span>
      </div>
    )
  }
  const d = q.data
  if (!qs || !d || d.error) return null // loading, API error or quota exhausted: hide the box, never block a trade
  if (!d.found || d.best_estimate == null) {
    return <div className={`${box} text-fg-muted`}>Chưa có giá tham chiếu</div>
  }
  const conf = d.confidence_tier ? { high: 'cao', medium: 'trung bình', low: 'thấp', prime: 'rất cao' }[d.confidence_tier] ?? d.confidence_tier : '—'
  const graded = d.gradeLabel && !/^raw/i.test(d.gradeLabel)
  return (
    <div className={box}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-fg-muted">Giá tham chiếu thị trường</span>
        <span className="font-mono font-bold text-fg-base">${d.best_estimate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      </div>
      <div className="mt-0.5 text-fg-muted">
        {d.name} · {d.setName} #{d.cardNumber}{d.gradeLabel ? ` · ${d.gradeLabel}` : ''}
      </div>
      <div className="mt-0.5 text-fg-muted">
        Tin cậy {conf}{d.freshness_days != null ? ` · cập nhật ${d.freshness_days} ngày trước` : ''}
      </div>
      {graded && !compact && <div className="mt-0.5 text-fg-muted">Giá thẻ đã chấm điểm ({d.gradeLabel}), thường cao hơn thẻ raw. Chỉ để tham khảo.</div>}
      <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary hover:underline">Nguồn: Renaiss OS Index ↗</a>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{c.name} <RarityBadge rarity={c.rarity} /></DialogTitle>
          <DialogDescription>Token ID #{c.id} · ERC-1155</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <div className="space-y-3">
            <CardFace card={c} quality="high" />
            <RefPrice card={c} />
          </div>
          <div className="min-w-0 space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {c.setName && (<><dt className="text-fg-muted">Set Pokémon</dt><dd className="text-right">{c.setName}</dd></>)}
              {c.localId && !c.isReward && (<><dt className="text-fg-muted">Số thẻ</dt><dd className="text-right font-mono">{c.localId}</dd></>)}
              {c.officialRarity && (<><dt className="text-fg-muted">Độ hiếm chính thức</dt><dd className="text-right">{c.officialRarity}</dd></>)}
              {c.image && (<><dt className="text-fg-muted">Bậc on-chain</dt><dd className="text-right font-semibold">{c.isReward ? 'Reward' : c.rarityName}</dd></>)}
              <dt className="text-fg-muted">Đang lưu hành</dt><dd className="text-right font-mono">{c.supply.toLocaleString()} / {c.maxSupply.toLocaleString()}</dd>
              <dt className="text-fg-muted">Đã burn (đổi thưởng)</dt><dd className="text-right font-mono">{c.burned.toLocaleString()}</dd>
              <dt className="text-fg-muted">Số ví nắm giữ</dt><dd className="text-right font-mono">{q.data == null ? '…' : q.data.holders < 0 ? '—' : q.data.holders}</dd>
              {c.rarity < 4 && (<><dt className="text-fg-muted">Tỷ lệ rút / lượt</dt><dd className="text-right font-mono">{RARITY_ODDS[c.rarity]}%</dd></>)}
            </dl>
            {actions}
            {c.tcgdexId && (
              <p className="text-[11px] leading-4 text-fg-muted">
                Bản số học thuật của thẻ Pokémon TCG, không liên kết với Nintendo hay The Pokémon Company. Dữ liệu và ảnh từ{' '}
                <a className="text-primary hover:underline" href={`https://tcgdex.dev`} target="_blank" rel="noreferrer">TCGdex</a>
                {' '}(<a className="text-primary hover:underline" href={`${TCGDEX_BASE}/${c.lang || 'en'}/cards/${c.tcgdexId}`} target="_blank" rel="noreferrer">{c.tcgdexId}</a>).
              </p>
            )}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">Lịch sử giao dịch</div>
              {!q.data ? <div className="text-xs text-fg-muted">Đang tải…</div> : q.data.sales.length === 0 ? (
                <div className="text-xs text-fg-muted">Chưa có giao dịch nào trên chợ.</div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {q.data.sales.map((s) => (
                    <div key={s.txHash} className="flex items-center justify-between rounded bg-bg-subtle px-2 py-1.5 text-xs">
                      <span className="text-fg-muted">{timeAgo(s.at)} · {short(s.buyer)}</span>
                      <span className="font-mono">
                        {s.isBundle ? `${fmtEth(s.price)} ETH (cả bộ)` : `${s.amount}× · ${fmtEth(s.unitPrice || s.price, 5)} ETH/thẻ`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
