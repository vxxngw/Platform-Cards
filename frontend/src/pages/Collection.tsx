import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace } from '@/components/tc/CardFace'
import { CardDialog } from '@/components/tc/CardDialog'
import { connectNewWallet } from '@/components/tc/Shell'
import { sendTx, fmtEth, fmtUsd, useWalletStore, type CollectionSet, type OwnedCard } from '@/lib/tc'
import { useCollection, useConfig, useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'

export function ApprovalGate() {
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <div className="font-semibold text-amber-300">Cần cấp quyền cho Marketplace</div>
      <p className="mt-1">
        setApprovalForAll(Marketplace, true) cho phép hợp đồng chợ chuyển <b>mọi thẻ</b> của bạn vào escrow khi bạn niêm yết. Chỉ ký cho đúng địa chỉ hợp đồng chợ, có thể thu hồi bất cứ lúc nào.
      </p>
      <Button size="sm" className="mt-2" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await sendTx('setApprovalForAll', 'tc/approve', { approved: true }); refresh() } catch { /* toast */ } finally { setBusy(false) }
      }}>Tôi hiểu, cấp quyền</Button>
    </div>
  )
}

function ListForm({ card, onDone }: { card: OwnedCard; onDone: () => void }) {
  const me = useMe()
  const cfg = useConfig()
  const ethUsd = useEthUsd()
  const refresh = useRefresh()
  const [amount, setAmount] = useState(1)
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  if (card.balance < 1) return <div className="rounded-md bg-bg-subtle p-3 text-xs text-fg-muted">Bạn không còn bản nào để bán{card.listed ? ` (${card.listed} đang niêm yết)` : ''}.</div>
  if (!me.data?.wallet?.marketApproved) return <ApprovalGate />
  const fee = cfg.data?.feeBps ?? 250
  const p = Number(price)
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Niêm yết bán</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-fg-muted">Số lượng (có {card.balance})
          <Input type="number" min={1} max={card.balance} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(card.balance, Number(e.target.value) || 1)))} />
        </label>
        <label className="text-xs text-fg-muted">Tổng giá (ETH)
          <Input inputMode="decimal" placeholder="0.005" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
        </label>
      </div>
      {p > 0 && (
        <div className="text-xs text-fg-muted">
          Nhận về sau phí {fee / 100}%: <span className="font-mono text-fg-base">{fmtEth(p * (1 - fee / 10000), 6)} ETH</span>
          {ethUsd ? ` ≈ ${fmtUsd(p * (1 - fee / 10000) * ethUsd)}` : ''} · {fmtEth(p / amount, 6)} ETH/thẻ
        </div>
      )}
      <Button size="sm" className="w-full" disabled={busy || !(p > 0)} onClick={async () => {
        setBusy(true)
        try { await sendTx(`Niêm yết ${amount}× ${card.name}`, 'tc/listings', { cardId: card.id, amount, price }); refresh(); onDone() } catch { /* toast */ } finally { setBusy(false) }
      }}>Niêm yết (thẻ chuyển vào escrow)</Button>
    </div>
  )
}

function BundleDialog({ set, open, onOpenChange }: { set: CollectionSet; open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe()
  const refresh = useRefresh()
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const main = set.cards.filter((c) => !c.isReward)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bán nguyên bộ “{set.name}”</DialogTitle>
          <DialogDescription>listBundle: escrow 1 bản của mỗi thẻ trong {main.length} thẻ. Người mua trả 1 lần, nhận đủ bộ.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-1.5">{main.map((c) => <CardFace key={c.id} card={c} />)}</div>
        {!me.data?.wallet?.marketApproved ? <ApprovalGate /> : (
          <div className="space-y-2">
            <label className="text-xs text-fg-muted">Giá cả bộ (ETH)
              <Input inputMode="decimal" placeholder="0.08" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
            </label>
            <Button className="w-full" disabled={busy || !(Number(price) > 0)} onClick={async () => {
              setBusy(true)
              try { await sendTx(`Niêm yết bộ ${set.name}`, 'tc/listings/bundle', { setId: set.id, price }); refresh(); onOpenChange(false) } catch { /* toast */ } finally { setBusy(false) }
            }}>Niêm yết nguyên bộ</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SetBlock({ set, onSelect }: { set: CollectionSet; onSelect: (c: OwnedCard) => void }) {
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const [bundle, setBundle] = useState(false)
  const main = set.cards.filter((c) => !c.isReward)
  const reward = set.cards.find((c) => c.isReward)
  const pct = Math.round((set.owned / set.total) * 100)
  const dupes = main.reduce((s, c) => s + Math.max(0, c.balance - 1), 0)
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-bold">{set.name}</h2>
            <span className="font-mono text-sm text-fg-subtle">{set.owned}/{set.total} thẻ · {pct}%</span>
            {dupes > 0 && <span className="text-xs text-fg-muted">{dupes} thẻ trùng</span>}
          </div>
          <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-bg-subtle">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: set.complete ? '#34d399' : 'var(--primary)' }} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!set.complete} onClick={() => setBundle(true)}>Bán nguyên bộ</Button>
          <Button size="sm" disabled={!set.complete || busy} onClick={async () => {
            setBusy(true)
            try { await sendTx(`Đổi bộ ${set.name} lấy thẻ thưởng`, `tc/sets/${set.id}/redeem`); refresh() } catch { /* toast */ } finally { setBusy(false) }
          }}>Đổi thưởng{reward ? `: ${reward.name}` : ''}</Button>
        </div>
      </div>
      {!set.complete && set.owned > 0 && (
        <div className="mt-2 text-xs text-fg-muted">
          Còn thiếu: {main.filter((c) => c.balance === 0).map((c) => c.name).join(', ')} · <Link to={`/market?set=${set.id}`} className="text-primary hover:underline">tìm trên chợ →</Link>
        </div>
      )}
      <div className="mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-6 lg:grid-cols-12">
        {set.cards.map((c) => (
          <div key={c.id}>
            <CardFace card={c} count={c.balance} dim={c.balance === 0} onClick={() => onSelect(c)} />
            {c.listed > 0 && <div className="mt-0.5 text-center text-[10px] text-amber-400">{c.listed} đang bán</div>}
          </div>
        ))}
      </div>
      <BundleDialog set={set} open={bundle} onOpenChange={setBundle} />
    </section>
  )
}

export default function Collection() {
  const { current } = useWalletStore()
  const col = useCollection()
  const me = useMe()
  const refresh = useRefresh()
  const [sel, setSel] = useState<OwnedCard | null>(null)
  const [busy, setBusy] = useState(false)

  if (!current) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center">
        <div className="text-lg font-semibold">Kết nối ví để xem bộ sưu tập</div>
        <Button className="mt-4" onClick={() => connectNewWallet().then(refresh)}>Kết nối ví</Button>
      </div>
    )
  }
  const pending = Number(me.data?.wallet?.pending || 0)
  const totalCards = (col.data || []).reduce((s, x) => s + x.cards.reduce((a, c) => a + c.balance, 0), 0)
  const live = sel ? col.data?.flatMap((s) => s.cards).find((c) => c.id === sel.id) || sel : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Bộ sưu tập</h1>
          <p className="text-sm text-fg-subtle">{totalCards} thẻ trong ví. Bấm vào thẻ để xem lịch sử hoặc niêm yết bán.</p>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            <span>Tiền bán thẻ chờ rút: <b className="font-mono">{fmtEth(pending, 6)} ETH</b></span>
            <Button size="sm" disabled={busy} onClick={async () => {
              setBusy(true)
              try { await sendTx('Rút ETH từ Marketplace', 'tc/withdraw'); refresh() } catch { /* toast */ } finally { setBusy(false) }
            }}>Rút về ví</Button>
          </div>
        )}
      </div>
      {col.isLoading && <Skeleton className="h-64 rounded-xl" />}
      {totalCards === 0 && col.data && (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-fg-muted">
          Ví chưa có thẻ nào. <Link to="/" className="text-primary hover:underline">Mua pack</Link> hoặc <Link to="/market" className="text-primary hover:underline">mua lẻ trên chợ</Link>.
        </div>
      )}
      {(col.data || []).map((s) => <SetBlock key={s.id} set={s} onSelect={setSel} />)}
      <CardDialog card={live} open={!!sel} onOpenChange={(o) => !o && setSel(null)}
        actions={live ? <ListForm card={live} onDone={() => setSel(null)} /> : null} />
    </div>
  )
}
