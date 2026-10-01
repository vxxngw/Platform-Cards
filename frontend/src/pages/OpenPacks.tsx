import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { CardBack, CardFace } from '@/components/tc/CardFace'
import { connectNewWallet } from '@/components/tc/Shell'
import { http, sendTx, short, timeAgo, verifyDraw, sha256Hex, RARITY_COLOR, RARITY_NAMES, useWalletStore, CHAIN_MODE, type CardSet, type OpenRequest, type Card } from '@/lib/tc'
import { txUrl } from '@/lib/chain/config'
import { useMe, useRefresh, useSets } from '@/lib/hooks'
import { Link } from '@/lib/router'

function FlipCard({ card, flipped, onFlip, delay }: { card: Card; flipped: boolean; onFlip: () => void; delay: number }) {
  return (
    <div className="[perspective:900px]" onClick={onFlip}>
      <div
        className="relative cursor-pointer transition-transform duration-700"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transitionDelay: `${delay}ms` }}
      >
        <div style={{ backfaceVisibility: 'hidden' }}><CardBack /></div>
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
          <CardFace card={card} />
        </div>
      </div>
    </div>
  )
}

function ChainVerify({ req }: { req: OpenRequest }) {
  const link = (h: string | null) => (h && txUrl(h) ? <a href={txUrl(h)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{short(h, 12)} ↗</a> : <span>{h ? short(h, 12) : '—'}</span>)
  return (
    <div className="rounded-xl border border-border p-4 text-xs">
      <div className="mb-2 text-sm font-semibold">Kiểm chứng kết quả</div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 font-mono">
        <dt className="text-fg-muted">VRF requestId</dt><dd className="truncate">{String(req.reqId)}</dd>
        <dt className="text-fg-muted">tx openPacks</dt><dd className="truncate">{link(req.txHash)}</dd>
        <dt className="text-fg-muted">tx claimPacks</dt><dd className="truncate">{link(req.fulfillTx)}</dd>
      </dl>
      <p className="mt-2 text-fg-muted">
        Số ngẫu nhiên do Chainlink VRF v2.5 sinh và kèm bằng chứng mật mã, hợp đồng PackSale lưu lại, rồi suy ra 5 thẻ/pack từ đó khi bạn nhận thẻ (claimPacks). Mở link tx claimPacks trên Etherscan để xem sự kiện PackOpened và danh sách thẻ được mint.
      </p>
    </div>
  )
}

function Verify({ req, set }: { req: OpenRequest; set?: CardSet }) {
  const [res, setRes] = useState<null | { commitOk: boolean; match: number; total: number; rows: Awaited<ReturnType<typeof verifyDraw>> }>(null)
  const [busy, setBusy] = useState(false)
  async function run() {
    if (!req.seed || !set) return
    setBusy(true)
    const commitOk = (await sha256Hex(req.seed)) === req.seedCommit
    const rows = await verifyDraw(req.seed, set.cards, req.count)
    const match = rows.filter((r, i) => r.cardId === req.cards[i]?.id).length
    setRes({ commitOk, match, total: rows.length, rows })
    setBusy(false)
  }
  return (
    <div className="rounded-xl border border-border p-4 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Kiểm chứng kết quả</span>
        <Button size="sm" variant="outline" onClick={run} disabled={busy || !req.seed}>{busy ? 'Đang tính…' : 'Tự kiểm chứng trên trình duyệt'}</Button>
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 font-mono">
        <dt className="text-fg-muted">reqId</dt><dd>#{req.reqId} · {short(req.reqHash, 12)}</dd>
        <dt className="text-fg-muted">tx openPacks</dt><dd className="truncate">{req.txHash}</dd>
        <dt className="text-fg-muted">tx fulfill</dt><dd className="truncate">{req.fulfillTx || '—'}</dd>
        <dt className="text-fg-muted">seed commit</dt><dd className="truncate">{req.seedCommit}</dd>
        <dt className="text-fg-muted">random word</dt><dd className="truncate">{req.seed || 'chưa công bố'}</dd>
      </dl>
      <p className="mt-2 text-fg-muted">
        Cam kết seed được công bố ngay khi gửi yêu cầu, trước khi có kết quả. Mỗi lá: r = sha256(seed:k) mod 10000, so ngưỡng 6000/8800/9800; lá thứ 5 dùng 6000 + r mod 4000; chọn thẻ bằng sha256(seed:k:card) mod số thẻ cùng độ hiếm.
      </p>
      {res && (
        <div className="mt-3 space-y-2">
          <div className={res.commitOk && res.match === res.total ? 'text-emerald-400' : 'text-amber-400'}>
            sha256(seed) {res.commitOk ? 'khớp' : 'KHÔNG khớp'} cam kết · {res.match}/{res.total} lá khớp kết quả
            {res.match < res.total && res.commitOk ? ' (lá lệch do thẻ chạm maxSupply → rơi xuống độ hiếm thấp hơn)' : ''}
          </div>
          <div className="grid grid-cols-5 gap-1">
            {res.rows.map((r) => (
              <div key={r.k} className="rounded bg-bg-subtle px-1.5 py-1 font-mono">
                <span className="text-fg-muted">#{r.k} </span>{r.roll} <span style={{ color: RARITY_COLOR[r.rarity] }}>{RARITY_NAMES[r.rarity][0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OpenPacks() {
  const { current } = useWalletStore()
  const me = useMe()
  const sets = useSets()
  const refresh = useRefresh()
  const [active, setActive] = useState<number | string | null>(null)
  const [qtys, setQtys] = useState<Record<number, number>>({})
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  // resume a pending request after reload
  useEffect(() => {
    const p = me.data?.pendingRequests?.[0]
    if (p && active == null) setActive(p)
  }, [me.data, active])

  const req = useQuery({
    queryKey: ['req', active],
    queryFn: () => http<OpenRequest>(`tc/packs/requests/${active}`),
    enabled: active != null,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' && q.state.data.status !== 'fulfilling' ? false : CHAIN_MODE ? 4000 : 1200),
  })
  const history = useQuery({ queryKey: ['reqs', current], queryFn: () => http<OpenRequest[]>('tc/packs/requests'), enabled: !!current })

  const r = req.data
  useEffect(() => {
    if (r?.status === 'fulfilled' || r?.status === 'cancelled') { refresh() }
  }, [r?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = useMemo(() => sets.data?.find((s) => s.id === r?.setId), [sets.data, r?.setId])

  async function open(setId: number, qty: number) {
    setBusy(true)
    try {
      const out = await sendTx<{ tx: string; reqId: number | string }>(`Mở ${qty} pack`, 'tc/packs/open', { setId, qty })
      setFlipped(new Set())
      setActive(out.reqId)
      refresh()
    } catch { /* toast */ } finally { setBusy(false) }
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border p-8 text-center">
        <div className="text-lg font-semibold">Kết nối ví để mở pack</div>
        <Button className="mt-4" onClick={() => connectNewWallet().then(refresh)}>Kết nối ví</Button>
      </div>
    )
  }

  const unopened = me.data?.unopened || []
  const waiting = r && (r.status === 'pending' || r.status === 'fulfilling')
  const readyToClaim = CHAIN_MODE && r?.status === 'ready'
  const done = r?.status === 'fulfilled'
  const rarest = done ? Math.max(...r.cards.map((c) => c.rarity)) : -1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Mở pack</h1>
        <p className="text-sm text-fg-subtle">Mỗi lần mở gửi 1 yêu cầu random. Kết quả về sau 1–3 block, thẻ được mint thẳng vào ví bạn.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {unopened.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-fg-muted md:col-span-2">
            Bạn chưa có pack nào. <Link to="/" className="text-primary hover:underline">Chọn một bộ để mua pack →</Link>
          </div>
        )}
        {unopened.map((u) => {
          const qty = Math.min(qtys[u.setId] ?? Math.min(u.count, 1), u.count)
          return (
            <div key={u.setId} className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="relative w-14 shrink-0"><CardBack /><span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 font-mono text-xs font-bold text-white">{u.count}</span></div>
              <div className="flex-1">
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-fg-muted">{u.count} pack chưa mở</div>
                <div className="mt-2 flex items-center gap-2">
                  <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={qty} onChange={(e) => setQtys({ ...qtys, [u.setId]: Number(e.target.value) })}>
                    {Array.from({ length: Math.min(10, u.count) }, (_, i) => <option key={i} value={i + 1}>{i + 1} pack</option>)}
                  </select>
                  <Button size="sm" disabled={busy || !!waiting || readyToClaim} onClick={() => open(u.setId, qty)}>Mở pack</Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {waiting && (
        <div className="rounded-xl border border-border p-8 text-center">
          <div className="mx-auto mb-4 flex w-fit gap-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-12 animate-pulse" style={{ animationDelay: `${i * 120}ms` }}><CardBack /></div>)}
          </div>
          <div className="font-semibold">Đang mở pack… chờ random từ VRF</div>
          <div className="mt-1 font-mono text-xs text-fg-muted">
            {CHAIN_MODE ? `VRF requestId ${short(String(r.reqId), 8)} · thường về sau 1–3 block` : `reqId #${r.reqId} · seed commit ${short(r.seedCommit, 10)}`}
          </div>
          {CHAIN_MODE && Date.now() - new Date(r.createdAt).getTime() > 3600_000 && (
            <Button size="sm" variant="outline" className="mt-3" onClick={async () => {
              try { await sendTx('cancelStuckRequest', 'tc/packs/cancel', { reqId: String(r.reqId) }); refresh() } catch { /* toast */ }
            }}>VRF không phản hồi — hoàn pack</Button>
          )}
        </div>
      )}

      {CHAIN_MODE && r?.status === 'ready' && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-8 text-center">
          <div className="mx-auto mb-4 flex w-fit gap-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-12"><CardBack /></div>)}
          </div>
          <div className="font-semibold">Chainlink VRF đã trả số ngẫu nhiên</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
            Bước cuối: ký giao dịch nhận thẻ. Kết quả đã được chốt bởi số ngẫu nhiên, ký lúc nào cũng không đổi được thẻ rút.
          </p>
          <Button className="mt-4" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await sendTx(`Nhận ${r.count * 5} thẻ`, 'tc/packs/claim', { reqId: String(r.reqId) }); setFlipped(new Set()); refresh() } catch { /* toast */ } finally { setBusy(false) }
          }}>Nhận {r.count * 5} thẻ</Button>
        </div>
      )}

      {r?.status === 'cancelled' && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Yêu cầu {short(String(r.reqId), 8)} không thực hiện được — pack đã được hoàn lại vào ví.</div>
      )}

      {done && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-bold">{r.setName} · {r.count} pack · {r.cards.length} thẻ</div>
              <div className="text-xs text-fg-muted">
                Thẻ hiếm nhất: <span style={{ color: RARITY_COLOR[rarest] }}>{RARITY_NAMES[rarest]}</span> · bấm từng lá để lật
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFlipped(new Set(r.cards.map((_, i) => i)))}>Lật tất cả</Button>
              <Link to="/collection"><Button size="sm">Xem bộ sưu tập</Button></Link>
            </div>
          </div>
          {Array.from({ length: r.count }, (_, p) => (
            <div key={p}>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-muted">Pack {p + 1}</div>
              <div className="grid grid-cols-5 gap-3 md:max-w-3xl">
                {r.cards.slice(p * 5, p * 5 + 5).map((c, i) => {
                  const idx = p * 5 + i
                  return (
                    <FlipCard key={idx} card={c} flipped={flipped.has(idx)} delay={flipped.size === r.cards.length ? i * 90 : 0}
                      onFlip={() => setFlipped((s) => new Set(s).add(idx))} />
                  )
                })}
              </div>
            </div>
          ))}
          {CHAIN_MODE ? <ChainVerify req={r} /> : <Verify req={r} set={set} />}
        </section>
      )}

      {(history.data?.length ?? 0) > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold">Lần mở gần đây</div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {history.data!.map((h) => (
              <button key={h.reqId} onClick={() => { setFlipped(new Set(h.cards.map((_, i) => i))); setActive(h.reqId) }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-xs hover:bg-bg-subtle">
                <span className="w-12 font-mono text-fg-muted">#{h.reqId}</span>
                <span className="flex-1">{h.setName} · {h.count} pack</span>
                <span className="flex gap-0.5">
                  {h.cards.filter((c) => c.rarity >= 1).slice(0, 8).map((c, i) => (
                    <span key={i} className="size-2 rounded-full" style={{ background: RARITY_COLOR[c.rarity] }} title={c.name} />
                  ))}
                </span>
                <span className="w-24 text-right text-fg-muted">{timeAgo(h.createdAt)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
