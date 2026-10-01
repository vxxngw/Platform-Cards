import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendTx, fmtEth, type CardSet } from '@/lib/tc'
import { Link } from '@/lib/router'
import { useConfig, useMe, useRefresh, useSets } from '@/lib/hooks'
import { ActivityFeed } from './Home'

function PackRow({ s }: { s: CardSet }) {
  const refresh = useRefresh()
  const [price, setPrice] = useState(s.pack?.price ?? '0.01')
  const [supply, setSupply] = useState(String(s.pack?.remaining ?? 1000))
  const [busy, setBusy] = useState(false)
  const save = async (onSale: boolean) => {
    setBusy(true)
    try { await sendTx(`configurePack bộ #${s.id}`, `tc/sets/${s.id}/pack`, { price, supply: Number(supply), onSale }); refresh() } catch { /* toast */ } finally { setBusy(false) }
  }
  return (
    <div className="grid grid-cols-[1fr_110px_110px_auto] items-center gap-2 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">#{s.id} {s.name}</div>
        <div className="text-[11px] text-fg-muted">{s.pack ? `${s.pack.total - s.pack.remaining} đã bán · ${s.pack.onSale ? 'đang bán' : 'đã đóng'}` : 'chưa cấu hình'}</div>
      </div>
      <Input className="h-8" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} aria-label="Giá ETH" />
      <Input className="h-8" value={supply} onChange={(e) => setSupply(e.target.value)} aria-label="Số pack còn lại" />
      <div className="flex gap-1">
        <Button size="sm" disabled={busy} onClick={() => save(true)}>{s.pack?.onSale ? 'Lưu' : 'Mở bán'}</Button>
        {s.pack?.onSale && <Button size="sm" variant="outline" disabled={busy} onClick={() => save(false)}>Đóng</Button>}
      </div>
    </div>
  )
}

export default function Admin() {
  const me = useMe()
  const cfg = useConfig()
  const sets = useSets()
  const refresh = useRefresh()
  const [fee, setFee] = useState('')
  const [busy, setBusy] = useState(false)

  if (!me.data?.wallet?.isAdmin) {
    return <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center text-sm text-fg-subtle">Trang này chỉ dành cho ví có ADMIN_ROLE. Chuyển sang “Deployer (Admin)” trong menu ví.</div>
  }
  const c = cfg.data
  const run = async (label: string, path: string, body: unknown = {}) => {
    setBusy(true)
    try { await sendTx(label, path, body); refresh() } catch { /* toast */ } finally { setBusy(false) }
  }
  const revenue = Number(c?.packRevenue || 0) + Number(c?.marketFees || 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">Admin</h1>
        <p className="text-sm text-fg-subtle">Ví deployer giữ ADMIN_ROLE trên cả 3 hợp đồng. PackSale giữ MINTER_ROLE.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-fg-muted">Doanh thu chờ rút</div>
          <div className="mt-1 font-mono text-2xl font-bold">{fmtEth(revenue, 6)} ETH</div>
          <div className="mt-1 text-[11px] text-fg-muted">Pack {fmtEth(c?.packRevenue || 0, 6)} · phí sàn {fmtEth(c?.marketFees || 0, 6)}</div>
          <Button size="sm" className="mt-3" disabled={busy || revenue <= 0} onClick={() => run('Rút doanh thu', 'tc/admin/withdraw')}>withdraw()</Button>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-fg-muted">Trạng thái hợp đồng</div>
          <div className={`mt-1 text-2xl font-bold ${c?.paused ? 'text-destructive' : 'text-emerald-400'}`}>{c?.paused ? 'Đang tạm dừng' : 'Hoạt động'}</div>
          <div className="mt-1 text-[11px] text-fg-muted">Pause chặn mua/mở pack, chuyển thẻ, niêm yết, mua bán, đổi thưởng.</div>
          <Button size="sm" variant={c?.paused ? 'default' : 'destructive'} className="mt-3" disabled={busy}
            onClick={() => run(c?.paused ? 'unpause()' : 'pause()', 'tc/admin/pause', { paused: !c?.paused })}>{c?.paused ? 'unpause()' : 'pause()'}</Button>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs text-fg-muted">Phí sàn</div>
          <div className="mt-1 font-mono text-2xl font-bold">{(c?.feeBps ?? 0) / 100}% <span className="text-sm text-fg-muted">({c?.feeBps} bps)</span></div>
          <div className="mt-3 flex gap-2">
            <Input className="h-8" placeholder="bps, tối đa 1000" value={fee} onChange={(e) => setFee(e.target.value)} />
            <Button size="sm" disabled={busy || fee === ''} onClick={() => run('setFee', 'tc/admin/fee', { bps: Number(fee) }).then(() => setFee(''))}>setFee</Button>
          </div>
        </div>
      </div>
      <Link to="/admin/pack-builder" className="flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4 hover:bg-primary/10">
        <div>
          <div className="font-semibold">Pack Builder — tạo bộ thẻ từ TCGdex</div>
          <p className="text-xs text-fg-subtle">Duyệt thẻ Pokémon TCG, bấm chọn 11 thẻ + 1 thẻ thưởng, tự điền metadata và phát hành set, pack trong vài phút.</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-primary">Mở →</span>
      </Link>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-border p-4 text-sm text-fg-subtle">Tạo bộ mới: dùng <Link to="/admin/pack-builder" className="text-primary hover:underline">Pack Builder</Link> (có chế độ “Thêm thẻ nhập tay” cho thẻ tự thiết kế).</div>
        <div className="space-y-5">
          <div className="rounded-xl border border-border p-4">
            <div className="font-semibold">Cấu hình pack</div>
            <div className="mt-1 grid grid-cols-[1fr_110px_110px_auto] gap-2 text-[11px] text-fg-muted"><span>Bộ</span><span>Giá (ETH)</span><span>Số pack còn</span><span /></div>
            <div className="divide-y divide-border">{(sets.data || []).map((s) => <PackRow key={`${s.id}-${s.pack?.price}-${s.pack?.remaining}`} s={s} />)}</div>
          </div>
          <ActivityFeed limit={15} />
        </div>
      </div>
    </div>
  )
}
