import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace, RarityBadge } from '@/components/tc/CardFace'
import { CardDialog, RefPrice } from '@/components/tc/CardDialog'
import { connectNewWallet } from '@/components/tc/Shell'
import { http, sendTx, fmtEth, fmtUsd, short, timeAgo, RARITY_NAMES, useWalletStore, type Card, type Listing } from '@/lib/tc'
import { useConfig, useEthUsd, useMe, useRefresh, useSets } from '@/lib/hooks'
import { Link } from '@/lib/router'

const sel = 'h-9 rounded-md border border-border bg-background px-2 text-sm'

function ListingCard({ l, onOpenCard }: { l: Listing; onOpenCard: (c: Card) => void }) {
  const { current } = useWalletStore()
  const me = useMe()
  const ethUsd = useEthUsd()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const mine = current && l.seller === current
  const price = Number(l.price)
  const balance = Number(me.data?.wallet?.balance || 0)
  const first = l.items[0]
  const card = first?.card

  async function act(kind: 'buy' | 'cancel') {
    setBusy(true)
    try {
      await sendTx(kind === 'buy' ? `Mua listing #${l.listingId}` : `Huỷ listing #${l.listingId}`, `tc/listings/${l.listingId}/${kind}`)
      refresh()
    } catch { /* toast */ } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border p-3">
      {l.isBundle ? (
        <div className="relative grid grid-cols-4 gap-1">
          {l.items.slice(0, 8).map((it, i) => it.card && <CardFace key={i} card={it.card} onClick={() => onOpenCard(it.card!)} />)}
          <span className="absolute -left-1 -top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">NGUYÊN BỘ · {l.items.length} thẻ</span>
        </div>
      ) : card ? (
        <div className="mx-auto w-full max-w-[150px]"><CardFace card={card} count={first.amount} onClick={() => onOpenCard(card)} /></div>
      ) : null}
      <div className="mt-3 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{l.isBundle ? l.setName : card?.name}</span>
          {!l.isBundle && card && <RarityBadge rarity={card.rarity} />}
        </div>
        {!l.isBundle && card?.officialRarity && (
          <div className="truncate text-[10px] text-fg-muted">{card.officialRarity}{card.localId ? ` · #${card.localId}` : ''}{card.setName ? ` · ${card.setName}` : ''}</div>
        )}
        <div className="text-[11px] text-fg-muted">
          #{l.listingId} · {l.isBundle ? 'trọn bộ' : l.setName} · {mine ? 'của bạn' : short(l.seller)} · {timeAgo(l.createdAt)}
        </div>
        <div className="flex items-baseline gap-1.5 pt-1">
          <span className="font-mono text-lg font-bold">{fmtEth(l.price, 6)}</span><span className="text-xs text-fg-subtle">ETH</span>
          {ethUsd && <span className="text-[11px] text-fg-muted">≈ {fmtUsd(price * ethUsd)}</span>}
        </div>
        {!l.isBundle && first.amount > 1 && <div className="text-[11px] text-fg-muted">{first.amount} bản · {fmtEth(price / first.amount, 6)} ETH/thẻ</div>}
        {!l.isBundle && card?.priceRef && <RefPrice card={card} compact />}
      </div>
      <div className="mt-3">
        {!current ? <Button size="sm" variant="outline" className="w-full" onClick={() => connectNewWallet().then(refresh)}>Kết nối ví để mua</Button>
          : mine ? <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => act('cancel')}>Huỷ niêm yết</Button>
          : <Button size="sm" className="w-full" disabled={busy || balance < price} onClick={() => act('buy')}>{balance < price ? 'Không đủ ETH' : 'Mua ngay'}</Button>}
      </div>
    </div>
  )
}

export default function Market({ initialSet }: { initialSet?: string }) {
  const sets = useSets()
  const cfg = useConfig()
  const [f, setF] = useState({ setId: initialSet || '', rarity: '', kind: '', min: '', max: '', sort: 'newest', mine: false })
  const { current } = useWalletStore()
  const [card, setCard] = useState<Card | null>(null)
  const params = new URLSearchParams({ setId: f.setId, rarity: f.rarity, kind: f.kind, min: f.min, max: f.max, sort: f.sort })
  const q = useQuery({ queryKey: ['listings', params.toString()], queryFn: () => http<Listing[]>(`tc/listings?${params}`), refetchInterval: 20000 })
  const list = (q.data || []).filter((l) => !f.mine || l.seller === current)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Chợ thẻ</h1>
          <p className="text-sm text-fg-subtle">Giá cố định, thẻ nằm trong escrow của hợp đồng. Phí sàn {(cfg.data?.feeBps ?? 250) / 100}% trừ vào người bán.</p>
        </div>
        <Link to="/collection" className="text-sm text-primary hover:underline">Niêm yết thẻ của bạn →</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={f.setId} onChange={(e) => setF({ ...f, setId: e.target.value })}>
          <option value="">Tất cả bộ</option>
          {(sets.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={sel} value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })}>
          <option value="">Mọi độ hiếm</option>
          {RARITY_NAMES.map((r, i) => <option key={r} value={i}>{r}</option>)}
        </select>
        <select className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="">Lẻ + nguyên bộ</option><option value="single">Thẻ lẻ</option><option value="bundle">Nguyên bộ</option>
        </select>
        <Input className="h-9 w-28" placeholder="Giá từ" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(',', '.') })} />
        <Input className="h-9 w-28" placeholder="đến (ETH)" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value.replace(',', '.') })} />
        <select className={sel} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
          <option value="newest">Mới nhất</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option>
        </select>
        {current && (
          <label className="flex items-center gap-1.5 text-sm text-fg-subtle">
            <input type="checkbox" checked={f.mine} onChange={(e) => setF({ ...f, mine: e.target.checked })} /> Của tôi
          </label>
        )}
        <span className="ml-auto text-xs text-fg-muted">{list.length} listing</span>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-fg-muted">
          Chưa có listing nào khớp bộ lọc. Mở pack rồi niêm yết thẻ trùng ở trang <Link to="/collection" className="text-primary hover:underline">Bộ sưu tập</Link>.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((l) => <div key={l.listingId} className={l.isBundle ? 'col-span-2' : ''}><ListingCard l={l} onOpenCard={setCard} /></div>)}
        </div>
      )}
      <p className="text-[11px] text-fg-muted">Giá tham chiếu thị trường lấy từ Renaiss OS Index cho thẻ thật tương ứng, cập nhật mỗi 24 giờ, chỉ để tham khảo và không ảnh hưởng hợp đồng.</p>
      <CardDialog card={card} open={!!card} onOpenChange={(o) => !o && setCard(null)} />
    </div>
  )
}
