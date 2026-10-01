import { useQuery } from '@tanstack/react-query'
import { CardFace } from '@/components/tc/CardFace'
import { http, fmtEth, fmtUsd, short, timeAgo, RARITY_COLOR, RARITY_NAMES, RARITY_ODDS, type ChainEvent } from '@/lib/tc'
import { useEthUsd, useEvents, useSets } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { Skeleton } from '@/components/ui/skeleton'

type Stats = { packsSold: number; sales: number; volume: string; activeListings: number; wallets: number }

export function describeEvent(e: ChainEvent): string {
  const a = e.args as Record<string, any>
  switch (e.name) {
    case 'PacksPurchased': return `${short(a.buyer)} mua ${a.qty} pack · ${fmtEth(Number(a.paid) / 1e18)} ETH`
    case 'OpenRequested': return `${short(a.buyer)} yêu cầu mở ${a.qty} pack (req #${a.reqId})`
    case 'PackOpened': return `Req #${a.reqId} hoàn tất · ${a.cardIds?.length ?? 0} thẻ được mint`
    case 'Listed': return `${short(a.seller)} niêm yết ${a.isBundle ? 'nguyên bộ' : `${a.amounts?.[0]}× thẻ #${a.ids?.[0]}`} · ${fmtEth(Number(a.price) / 1e18, 5)} ETH`
    case 'Sold': return `Listing #${a.listingId} đã bán cho ${short(a.buyer)} · ${fmtEth(Number(a.price) / 1e18, 5)} ETH`
    case 'Cancelled': return `Listing #${a.listingId} bị huỷ`
    case 'SetRedeemed': return `${short(a.user)} đổi bộ #${a.setId} lấy thẻ thưởng #${a.rewardCardId}`
    case 'SetCreated': return `Tạo bộ “${a.name}” · ${a.cardIds?.length ?? 0} thẻ + 1 thẻ thưởng`
    case 'PackConfigured': return `Cấu hình pack bộ #${a.setId} · ${fmtEth(Number(a.price) / 1e18)} ETH · ${a.supply} pack`
    case 'ApprovalForAll': return `${short(a.account)} ${a.approved ? 'cấp' : 'thu hồi'} quyền cho Marketplace`
    case 'Withdrawn': return `${short(a.to)} rút ETH`
    case 'Paused': return 'Admin tạm dừng hợp đồng'
    case 'Unpaused': return 'Admin mở lại hợp đồng'
    case 'FeeUpdated': return `Phí sàn đổi thành ${a.bps / 100}%`
    case 'RoleGranted': return `Cấp ${a.role} cho ${String(a.account).startsWith('0x') ? short(a.account) : a.account}`
    default: return e.name
  }
}

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const ev = useEvents(limit)
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">Event on-chain gần đây</span>
        <span className="text-[11px] text-fg-muted">tự làm mới 30 giây</span>
      </div>
      <div className="divide-y divide-border">
        {(ev.data || []).map((e) => (
          <div key={e.id} className="flex items-start gap-3 px-4 py-2 text-xs">
            <span className="w-24 shrink-0 font-mono text-fg-muted">{e.name}</span>
            <span className="min-w-0 flex-1 text-fg-subtle">{describeEvent(e)}</span>
            <span className="shrink-0 text-fg-muted">{timeAgo(e.at)}</span>
          </div>
        ))}
        {ev.isLoading && <div className="p-4"><Skeleton className="h-16" /></div>}
      </div>
    </div>
  )
}

export function OddsTable() {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {RARITY_ODDS.map((p, r) => (
        <div key={r} className="rounded-md bg-bg-subtle px-2 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: RARITY_COLOR[r] }}>{RARITY_NAMES[r]}</div>
          <div className="font-mono text-sm">{p}%</div>
        </div>
      ))}
    </div>
  )
}

export default function Home() {
  const sets = useSets()
  const ethUsd = useEthUsd()
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => http<Stats>('tc/stats'), refetchInterval: 30000 })

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <h1 className="text-3xl font-black leading-tight md:text-4xl">Mở pack, gom đủ bộ, đổi thẻ thưởng.</h1>
          <p className="mt-2 max-w-xl text-fg-subtle">
            Mỗi pack 5 thẻ ngẫu nhiên có thể kiểm chứng, luôn có ít nhất 1 thẻ Rare trở lên. Thẻ trùng đem bán lẻ hoặc bán nguyên bộ trên chợ P2P, phí sàn 2,5%.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {[
            ['Pack đã bán', stats.data?.packsSold],
            ['Giao dịch chợ', stats.data?.sales],
            ['Khối lượng', stats.data ? `${fmtEth(stats.data.volume, 3)} Ξ` : undefined],
            ['Đang niêm yết', stats.data?.activeListings],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-background px-3 py-3">
              <div className="text-[11px] text-fg-muted">{k}</div>
              <div className="mt-0.5 font-mono text-lg font-bold">{v ?? '…'}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        {sets.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        {sets.error && <div className="text-sm text-destructive">Không tải được danh sách bộ. Thử lại sau.</div>}
        {(sets.data || []).map((s) => {
          const preview = [...s.cards].filter((c) => !c.isReward).sort((a, b) => b.rarity - a.rarity).slice(0, 3)
          const reward = s.cards.find((c) => c.isReward)
          const sold = s.pack ? s.pack.total - s.pack.remaining : 0
          return (
            <Link key={s.id} to={`/sets/${s.id}`} className="group block rounded-xl border border-border p-5 transition hover:border-fg-muted">
              <div className="flex gap-5">
                <div className="relative h-40 w-36 shrink-0">
                  {preview.map((c, i) => (
                    <div key={c.id} className="absolute w-24 transition group-hover:-translate-y-1" style={{ left: i * 18, top: i * 8, transform: `rotate(${(i - 1) * 7}deg)`, zIndex: 3 - i }}>
                      <CardFace card={c} />
                    </div>
                  )).reverse()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-bold">{s.name}</h2>
                    {s.pack?.onSale ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">ĐANG BÁN</span>
                      : <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[10px] font-bold text-fg-muted">TẠM ĐÓNG</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-fg-subtle">{s.description}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold">{s.pack ? fmtEth(s.pack.price) : '—'} ETH</span>
                    <span className="text-xs text-fg-muted">/ pack {s.pack && ethUsd ? `≈ ${fmtUsd(Number(s.pack.price) * ethUsd)}` : ''}</span>
                  </div>
                  {s.pack && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg-subtle"><div className="h-full bg-primary" style={{ width: `${(sold / Math.max(1, s.pack.total)) * 100}%` }} /></div>
                      <div className="mt-1 text-[11px] text-fg-muted">Còn {s.pack.remaining.toLocaleString()} / {s.pack.total.toLocaleString()} pack</div>
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-fg-muted">{s.cards.filter((c) => !c.isReward).length} thẻ · thưởng: <span className="text-primary">{reward?.name}</span></div>
                </div>
              </div>
            </Link>
          )
        })}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="text-sm font-semibold">Tỷ lệ mỗi lượt rút</div>
          <OddsTable />
          <ul className="space-y-1.5 text-xs text-fg-subtle">
            <li>Lá thứ 5 của mỗi pack rút từ bảng Rare+ → luôn có ít nhất 1 thẻ Rare trở lên.</li>
            <li>Thẻ chạm maxSupply thì lượt rút rơi xuống độ hiếm thấp hơn kế tiếp.</li>
            <li>Mỗi lần mở có reqId, seed và cam kết seed để bạn tự kiểm chứng kết quả.</li>
          </ul>
        </div>
        <ActivityFeed />
      </section>
    </div>
  )
}
