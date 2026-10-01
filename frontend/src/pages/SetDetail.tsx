import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace } from '@/components/tc/CardFace'
import { CardDialog } from '@/components/tc/CardDialog'
import { connectNewWallet } from '@/components/tc/Shell'
import { http, sendTx, fmtEth, fmtUsd, useWalletStore, type Card, type CardSet } from '@/lib/tc'
import { useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { Link, navigate } from '@/lib/router'
import { OddsTable } from './Home'

export default function SetDetail({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['set', id], queryFn: () => http<CardSet>(`tc/sets/${id}`) })
  const me = useMe()
  const { current } = useWalletStore()
  const ethUsd = useEthUsd()
  const refresh = useRefresh()
  const [qty, setQty] = useState(3)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<Card | null>(null)

  if (q.isLoading) return <Skeleton className="h-96 rounded-xl" />
  if (!q.data) return <div className="text-sm text-destructive">Không tìm thấy bộ này.</div>
  const s = q.data
  const total = s.pack ? Number(s.pack.price) * qty : 0
  const balance = Number(me.data?.wallet?.balance || 0)
  const unopened = me.data?.unopened?.find((u) => u.setId === s.id)?.count || 0
  const main = s.cards.filter((c) => !c.isReward)
  const reward = s.cards.find((c) => c.isReward)

  async function buy() {
    setBusy(true)
    try {
      await sendTx(`Mua ${qty} pack ${s.name}`, 'tc/packs/buy', { setId: s.id, qty })
      refresh()
    } catch { /* toast shown */ } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-fg-muted"><Link to="/" className="hover:text-fg-base">Bộ thẻ</Link> / {s.name}</div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h1 className="text-3xl font-black">{s.name}</h1>
          <p className="mt-1 max-w-2xl text-fg-subtle">{s.description}</p>
          <div className="mt-2 font-mono text-[11px] text-fg-muted">setId {s.id} · {main.length} thẻ · base URI {s.baseUri}</div>

          <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {main.map((c) => (
              <div key={c.id} className="space-y-1">
                <CardFace card={c} onClick={() => setSel(c)} />
                <div className="flex justify-between font-mono text-[10px] text-fg-muted">
                  <span>{c.supply.toLocaleString()}</span><span>/ {c.maxSupply.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {reward && (
            <div className="mt-6 flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="w-24 shrink-0"><CardFace card={reward} onClick={() => setSel(reward)} /></div>
              <div className="text-sm">
                <div className="font-semibold">Thẻ thưởng: {reward.name}</div>
                <p className="mt-1 text-fg-subtle">Không có trong pack. Chỉ nhận được khi đổi (burn) 1 bản của cả {main.length} thẻ trong bộ. Đã phát hành {reward.supply}/{reward.maxSupply}.</p>
                <Link to="/collection" className="mt-1 inline-block text-xs text-primary hover:underline">Xem tiến độ của bạn →</Link>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm text-fg-muted">Giá mỗi pack (5 thẻ)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold">{s.pack ? fmtEth(s.pack.price) : '—'}</span><span className="text-fg-subtle">ETH</span>
              {s.pack && ethUsd && <span className="text-xs text-fg-muted">≈ {fmtUsd(Number(s.pack.price) * ethUsd)}</span>}
            </div>
            <div className="mt-1 text-xs text-fg-muted">Còn {s.pack?.remaining.toLocaleString() ?? 0} pack · tối đa 10 pack / giao dịch</div>

            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.max(1, x - 1))} aria-label="Giảm"><Minus /></Button>
              <div className="flex-1 text-center font-mono text-xl font-bold">{qty}</div>
              <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.min(10, x + 1))} aria-label="Tăng"><Plus /></Button>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-fg-muted">msg.value</span>
              <span className="font-mono">{fmtEth(total, 6)} ETH</span>
            </div>
            {current && me.data?.wallet && balance < total && (
              <div className="mt-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">Không đủ ETH (số dư {fmtEth(balance)}). Dùng faucet trong menu ví.</div>
            )}
            {!s.pack?.onSale && <div className="mt-2 rounded bg-bg-subtle px-2 py-1.5 text-xs text-fg-muted">Bộ này đang tạm đóng bán.</div>}
            {!current ? (
              <Button className="mt-4 w-full" onClick={() => connectNewWallet().then(refresh)}>Kết nối ví để mua</Button>
            ) : (
              <Button className="mt-4 w-full" disabled={busy || !s.pack?.onSale || balance < total} onClick={buy}>
                {busy ? 'Đang xử lý…' : `Mua ${qty} pack`}
              </Button>
            )}
            {unopened > 0 && (
              <Button variant="outline" className="mt-2 w-full" onClick={() => navigate('/open')}>Mở {unopened} pack chưa mở →</Button>
            )}
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 text-sm font-semibold">Tỷ lệ mỗi lượt rút</div>
            <OddsTable />
            <p className="mt-2 text-xs text-fg-muted">Slot cuối mỗi pack rút từ bảng Rare+ (Rare 70% · Epic 25% · Legendary 5%).</p>
          </div>
        </aside>
      </div>
      <CardDialog card={sel} open={!!sel} onOpenChange={(o) => !o && setSel(null)} />
    </div>
  )
}
