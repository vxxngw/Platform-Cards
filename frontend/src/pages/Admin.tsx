import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { sendTx, fmtEth, RARITY_NAMES, RARITY_COLOR, CHAIN_MODE, type CardSet } from '@/lib/tc'
import { Link } from '@/lib/router'
import { useConfig, useMe, useRefresh, useSets } from '@/lib/hooks'
import { ActivityFeed } from './Home'

const SUPPLY = [10000, 3000, 800, 100]
const DEFAULT_ROWS = [3, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0].map((r) => ({ name: '', rarity: r, maxSupply: SUPPLY[r], priceQ: '' }))

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

function CreateSet() {
  const refresh = useRefresh()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [reward, setReward] = useState('')
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [busy, setBusy] = useState(false)
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  async function submit() {
    setBusy(true)
    try {
      await sendTx(`createSet “${name}”`, 'tc/sets', {
        name, description: desc, rewardName: reward,
        cards: rows.map((r) => ({ name: r.name, rarity: r.rarity, maxSupply: r.maxSupply, priceRef: r.priceQ ? { game: 'pokemon', q: r.priceQ } : undefined })),
      })
      setName(''); setDesc(''); setReward(''); setRows(DEFAULT_ROWS)
      refresh()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <div className="font-semibold">Tạo bộ mới</div>
        <p className="text-xs text-fg-muted">createSet: tạo cardId liên tiếp + 1 thẻ thưởng. Bộ cần 8–12 thẻ, đủ 4 độ hiếm. Sau khi tạo, cấu hình pack ở bảng bên cạnh để mở bán.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Tên bộ" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Tên thẻ thưởng" value={reward} onChange={(e) => setReward(e.target.value)} />
      </div>
      <Textarea placeholder="Mô tả" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="space-y-1.5">
        <div className="grid grid-cols-[24px_1fr_120px_100px_1fr_28px] gap-2 text-[11px] text-fg-muted">
          <span>#</span><span>Tên thẻ</span><span>Độ hiếm</span><span>maxSupply</span><span>priceRef (tuỳ chọn, VD “charizard base set”)</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_120px_100px_1fr_28px] items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{i + 1}</span>
            <Input className="h-8" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder="Tên thẻ" />
            <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" style={{ color: RARITY_COLOR[r.rarity] }}
              value={r.rarity} onChange={(e) => upd(i, { rarity: Number(e.target.value), maxSupply: SUPPLY[Number(e.target.value)] })}>
              {RARITY_NAMES.slice(0, 4).map((n, k) => <option key={n} value={k}>{n}</option>)}
            </select>
            <Input className="h-8" type="number" value={r.maxSupply} onChange={(e) => upd(i, { maxSupply: Number(e.target.value) })} />
            <Input className="h-8" value={r.priceQ} onChange={(e) => upd(i, { priceQ: e.target.value })} placeholder="—" />
            <button className="text-fg-muted hover:text-destructive disabled:opacity-30" disabled={rows.length <= 8} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Xoá">×</button>
          </div>
        ))}
        <Button size="sm" variant="outline" disabled={rows.length >= 12} onClick={() => setRows([...rows, { name: '', rarity: 0, maxSupply: SUPPLY[0], priceQ: '' }])}>+ Thêm thẻ ({rows.length}/12)</Button>
      </div>
      <Button className="w-full" disabled={busy || !name.trim() || rows.some((r) => !r.name.trim())} onClick={submit}>Tạo bộ</Button>
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
      {CHAIN_MODE && (
        <Link to="/admin/pack-builder" className="flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4 hover:bg-primary/10">
          <div>
            <div className="font-semibold">Pack Builder — tạo bộ thẻ từ TCGdex</div>
            <p className="text-xs text-fg-subtle">Duyệt thẻ Pokémon TCG, bấm chọn 11 thẻ + 1 thẻ thưởng, tự điền metadata và phát hành set, pack trong vài phút.</p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-primary">Mở →</span>
        </Link>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {!CHAIN_MODE ? <CreateSet /> : <div className="rounded-xl border border-border p-4 text-sm text-fg-subtle">Tạo bộ mới ở chế độ on-chain: dùng <Link to="/admin/pack-builder" className="text-primary hover:underline">Pack Builder</Link> (có chế độ “Thêm thẻ nhập tay” cho thẻ tự thiết kế).</div>}
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
