import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RARITY_COLOR } from '@/lib/tc'
import { Link } from '@/lib/router'
import { TIER_ODDS, type Tier } from '@/lib/pokemon/tiers'
import { previewPool, validateDraft, type CheckItem } from '@/lib/pokemon/validate'
import { STEPS, runPublish, type BuilderContext, type PublishInput, type RunState, type StepId, type StepStatus } from '@/lib/pokemon/publish'
import { loadRun, saveRun, type Draft } from '@/lib/pokemon/draft'
import { addrUrl, ADDR } from '@/lib/chain/config'
import type { PinStatus } from '@/lib/pokemon/pin'
import { CheckList, StepList } from './parts'

const idle = (): Record<StepId, StepStatus> => ({ prepare: 'idle', pin: 'idle', create: 'idle', baseuri: 'idle', pack: 'idle' })
const fromDone = (done: StepId[]) => { const s = idle(); for (const d of done) s[d] = 'done'; return s }

export type WalletInfo = { connected: boolean; address: string | null; isAdmin: boolean; rightNetwork: boolean; connect: () => void }

export function PublishPanel({ draft, onChange, wallet, ctx, pin, onPublished }: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  wallet: WalletInfo
  ctx: BuilderContext | null
  /** undefined = still loading, null = /api/pin unreachable */
  pin: PinStatus | null | undefined
  onPublished: (setId: number) => void
}) {
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState<RunState>(() => loadRun() ?? { done: [] })
  const [status, setStatus] = useState<Record<StepId, StepStatus>>(() => fromDone(loadRun()?.done ?? []))
  const [detail, setDetail] = useState<Partial<Record<StepId, string>>>({})
  const [published, setPublished] = useState<{ setId: number } | null>(null)

  const missing = ctx?.missing ?? []
  const checks: CheckItem[] = useMemo(() => {
    const base = validateDraft({
      pool: draft.pool, reward: draft.reward, setName: draft.setName, priceEth: draft.priceEth, packs: draft.packs, rewardSupply: draft.rewardSupply,
      connected: wallet.connected, isAdmin: wallet.isAdmin, rightNetwork: wallet.rightNetwork,
    })
    base.push({
      id: 'server', ok: !!pin?.authConfigured && pin.mode === 'pinata', label: '/api/pin sẵn sàng (đã cấu hình PINATA_JWT và xác thực Admin)',
      hint: pin === undefined ? 'đang kiểm tra…' : pin === null ? '/api/pin không truy cập được' : !pin.authConfigured ? 'đặt COLLECTION_ADDRESS (hoặc ADMIN_ADDRESSES) trong Environment Variables của Vercel' : 'đặt PINATA_JWT trong Environment Variables của Vercel',
    })
    if (missing.length) base.push({ id: 'ack', ok: ack, label: `Chấp nhận dùng metadata tạm cho ${missing.length} thẻ cũ chưa tải được`, hint: `id ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` })
    return base
  }, [draft, wallet.connected, wallet.isAdmin, wallet.rightNetwork, missing, ack, pin])
  const preview = useMemo(() => previewPool(draft.pool, draft.reward), [draft.pool, draft.reward])
  const pinMode = pin?.mode ?? null
  const ready = checks.every((c) => c.ok)
  const inProgress = run.done.length > 0 && !published

  async function execute() {
    if (!wallet.address || !draft.reward) return
    const input: PublishInput = {
      address: wallet.address, pool: draft.pool, reward: draft.reward, setName: draft.setName.trim(), rewardSupply: Number(draft.rewardSupply),
      priceEth: draft.priceEth.trim(), packs: Number(draft.packs),
    }
    setBusy(true)
    try {
      const out = await runPublish(input, run, {
        onStep: (id, s, d) => { setStatus((p) => ({ ...p, [id]: s })); if (d !== undefined) setDetail((p) => ({ ...p, [id]: d })) },
        onState: (s) => { setRun(s); saveRun(s) },
      })
      saveRun(null)
      setRun({ done: [] })
      setPublished({ setId: out.setId! })
      toast.success(`Đã phát hành bộ #${out.setId}`, { description: 'Set đã tạo và mở bán pack.' })
      onPublished(out.setId!)
    } catch {
      /* the failing step shows its message; sendTx already toasted wallet errors */
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    if (run.setId != null && !window.confirm(`Bộ #${run.setId} đã được tạo on-chain. Bắt đầu lại sẽ tạo thêm một bộ mới (bộ cũ không xoá được). Tiếp tục?`)) return
    saveRun(null)
    setRun({ done: [] })
    setStatus(idle())
    setDetail({})
    setPublished(null)
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="font-semibold">3. Cấu hình bộ và pack</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-fg-muted sm:col-span-2">Tên bộ on-chain
          <Input className="h-9 text-sm text-fg-base" value={draft.setName} onChange={(e) => onChange({ setName: e.target.value })} placeholder="VD: Pokémon 151" />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">Giá mỗi pack (ETH)
          <Input className="h-9 text-sm text-fg-base" inputMode="decimal" value={draft.priceEth} onChange={(e) => onChange({ priceEth: e.target.value.replace(',', '.') })} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">Tổng số pack
          <Input className="h-9 text-sm text-fg-base" inputMode="numeric" value={draft.packs} onChange={(e) => onChange({ packs: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted sm:col-span-2">maxSupply thẻ thưởng
          <Input className="h-9 text-sm text-fg-base" inputMode="numeric" value={draft.rewardSupply} onChange={(e) => onChange({ rewardSupply: e.target.value })} />
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-semibold">Xem trước</div>
        <div className="overflow-hidden rounded-lg border border-border text-xs">
          <div className="grid grid-cols-[1fr_44px_64px_80px] gap-2 bg-bg-subtle px-3 py-1.5 text-fg-muted"><span>Bậc</span><span className="text-right">Thẻ</span><span className="text-right">Mỗi slot</span><span className="text-right">Mỗi thẻ</span></div>
          {preview.rows.map((r) => (
            <div key={r.tier} className="grid grid-cols-[1fr_44px_64px_80px] items-center gap-2 border-t border-border px-3 py-1.5">
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: RARITY_COLOR[r.tier] }}><span className="inline-block size-2 rounded-full" style={{ background: RARITY_COLOR[r.tier] }} />{r.name}</span>
              <span className={`text-right font-mono ${r.count === 0 ? 'text-destructive' : ''}`}>{r.count}</span>
              <span className="text-right font-mono">{TIER_ODDS[r.tier as Tier]}%</span>
              <span className="text-right font-mono text-fg-muted">{r.perCard == null ? '—' : `${r.perCard.toFixed(1)}%`}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">Slot 5 của mỗi pack rút từ bảng Rare+ (Rare 70% · Epic 25% · Legendary 5%) nên mỗi pack luôn có ít nhất 1 thẻ Rare trở lên. “Mỗi thẻ” tính cho slot 1–4.</p>
        {preview.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {preview.warnings.map((w) => <li key={w} className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">{w}</li>)}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-sm font-semibold">Kiểm tra trước khi phát hành</div>
        <CheckList items={checks} />
        {missing.length > 0 && (
          <label className="mt-2 flex items-start gap-2 text-xs text-fg-subtle">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{missing.length} thẻ đã phát hành trước đó không tải được metadata (base URI cũ không truy cập được). Thư mục mới sẽ ghi metadata tạm cho chúng (“Thẻ #id”); thẻ mới không bị ảnh hưởng.</span>
          </label>
        )}
        {!wallet.connected && <Button size="sm" className="mt-2" onClick={wallet.connect}>Kết nối ví Admin</Button>}
      </div>

      {pinMode && (
        <p className={`rounded px-2 py-1.5 text-[11px] ${pinMode === 'pinata' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {pinMode === 'pinata'
            ? 'Metadata sẽ được pin lên IPFS qua Pinata (JWT giữ ở server).'
            : 'Server chưa có PINATA_JWT nên chưa thể pin metadata lên IPFS. Đặt PINATA_JWT trong Environment Variables của Vercel rồi deploy lại.'}
        </p>
      )}

      {inProgress && !busy && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Có lần phát hành chưa xong{run.setId != null ? ` (bộ #${run.setId} đã tạo on-chain)` : ''}. Tiếp tục sẽ bỏ qua các bước đã hoàn thành.
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={execute} disabled={!ready}>Tiếp tục</Button>
            <Button size="sm" variant="outline" onClick={restart}>Bắt đầu lại</Button>
          </div>
        </div>
      )}

      {(busy || run.done.length > 0 || Object.values(status).some((s) => s === 'error')) && (
        <div className="rounded-lg border border-border p-3"><StepList status={status} detail={detail} /></div>
      )}

      {!inProgress && !published && (
        <Button className="w-full" disabled={!ready || busy} onClick={execute}>{busy ? 'Đang phát hành…' : 'Phát hành set và mở bán pack'}</Button>
      )}
      {!busy && Object.values(status).includes('error') && !inProgress && (
        <Button className="w-full" variant="outline" onClick={execute} disabled={!ready}>Thử lại bước lỗi</Button>
      )}

      {published && (
        <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <div className="font-semibold">Đã phát hành bộ #{published.setId}</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to={`/sets/${published.setId}`} className="text-primary hover:underline">Xem trang bộ →</Link>
            {addrUrl(ADDR.collection) && <a className="text-primary hover:underline" href={addrUrl(ADDR.collection)} target="_blank" rel="noreferrer">CardCollection ↗</a>}
            {run.baseUri && <span className="break-all text-fg-muted">{run.baseUri}</span>}
          </div>
          <Button size="sm" variant="outline" onClick={restart}>Tạo bộ khác</Button>
        </div>
      )}
      <p className="text-[11px] text-fg-muted">
        {STEPS.length} bước · 3 giao dịch ký trong ví (createSet, setBaseURI, configurePack) và 1 chữ ký tin nhắn để pin metadata.
      </p>
    </div>
  )
}
