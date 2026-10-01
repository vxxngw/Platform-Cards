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
      id: 'server', ok: !!pin?.authConfigured && pin.mode === 'pinata', label: '/api/pin ready (PINATA_JWT and admin check configured)',
      hint: pin === undefined ? 'checking…' : pin === null ? '/api/pin is unreachable' : !pin.authConfigured ? 'set COLLECTION_ADDRESS (or ADMIN_ADDRESSES) in the Vercel Environment Variables' : 'set PINATA_JWT in the Vercel Environment Variables',
    })
    if (missing.length) base.push({ id: 'ack', ok: ack, label: `Accept placeholder metadata for ${missing.length} older card(s) that could not be loaded`, hint: `id ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` })
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
      toast.success(`Set #${out.setId} published`, { description: 'The set exists on chain and its packs are on sale.' })
      onPublished(out.setId!)
    } catch {
      /* the failing step shows its message; sendTx already toasted wallet errors */
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    if (run.setId != null && !window.confirm(`Set #${run.setId} already exists on chain. Starting over creates another set (the old one cannot be deleted). Continue?`)) return
    saveRun(null)
    setRun({ done: [] })
    setStatus(idle())
    setDetail({})
    setPublished(null)
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="font-semibold">3. Set and pack settings</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-fg-muted sm:col-span-2">On-chain set name
          <Input className="h-9 text-sm text-fg-base" value={draft.setName} onChange={(e) => onChange({ setName: e.target.value })} placeholder="VD: Pokémon 151" />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">Price per pack (ETH)
          <Input className="h-9 text-sm text-fg-base" inputMode="decimal" value={draft.priceEth} onChange={(e) => onChange({ priceEth: e.target.value.replace(',', '.') })} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">Total packs
          <Input className="h-9 text-sm text-fg-base" inputMode="numeric" value={draft.packs} onChange={(e) => onChange({ packs: e.target.value })} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted sm:col-span-2">Reward card maxSupply
          <Input className="h-9 text-sm text-fg-base" inputMode="numeric" value={draft.rewardSupply} onChange={(e) => onChange({ rewardSupply: e.target.value })} />
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-semibold">Preview</div>
        <div className="overflow-hidden rounded-lg border border-border text-xs">
          <div className="grid grid-cols-[1fr_44px_64px_80px] gap-2 bg-bg-subtle px-3 py-1.5 text-fg-muted"><span>Tier</span><span className="text-right">Cards</span><span className="text-right">Per slot</span><span className="text-right">Per card</span></div>
          {preview.rows.map((r) => (
            <div key={r.tier} className="grid grid-cols-[1fr_44px_64px_80px] items-center gap-2 border-t border-border px-3 py-1.5">
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: RARITY_COLOR[r.tier] }}><span className="inline-block size-2 rounded-full" style={{ background: RARITY_COLOR[r.tier] }} />{r.name}</span>
              <span className={`text-right font-mono ${r.count === 0 ? 'text-destructive' : ''}`}>{r.count}</span>
              <span className="text-right font-mono">{TIER_ODDS[r.tier as Tier]}%</span>
              <span className="text-right font-mono text-fg-muted">{r.perCard == null ? '—' : `${r.perCard.toFixed(1)}%`}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-fg-muted">Slot 5 of every pack draws from the Rare+ table (Rare 70% · Epic 25% · Legendary 5%), so each pack holds at least one Rare. “Per card” applies to slots 1–4.</p>
        {preview.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {preview.warnings.map((w) => <li key={w} className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">{w}</li>)}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-sm font-semibold">Pre-publish checklist</div>
        <CheckList items={checks} />
        {missing.length > 0 && (
          <label className="mt-2 flex items-start gap-2 text-xs text-fg-subtle">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{missing.length} previously published card(s) have unreadable metadata (the old base URI is unreachable). The new folder writes placeholder metadata for them (“Card #id”); the new cards are not affected.</span>
          </label>
        )}
        {!wallet.connected && <Button size="sm" className="mt-2" onClick={wallet.connect}>Connect admin wallet</Button>}
      </div>

      {pinMode && (
        <p className={`rounded px-2 py-1.5 text-[11px] ${pinMode === 'pinata' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {pinMode === 'pinata'
            ? 'Metadata will be pinned to IPFS through Pinata (the JWT stays on the server).'
            : 'The server has no PINATA_JWT, so metadata cannot be pinned to IPFS. Set PINATA_JWT in the Vercel Environment Variables and redeploy.'}
        </p>
      )}

      {inProgress && !busy && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          A publish run is unfinished{run.setId != null ? ` (set #${run.setId} already exists on chain)` : ''}. Continuing skips the steps already done.
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={execute} disabled={!ready}>Continue</Button>
            <Button size="sm" variant="outline" onClick={restart}>Start over</Button>
          </div>
        </div>
      )}

      {(busy || run.done.length > 0 || Object.values(status).some((s) => s === 'error')) && (
        <div className="rounded-lg border border-border p-3"><StepList status={status} detail={detail} /></div>
      )}

      {!inProgress && !published && (
        <Button className="w-full" disabled={!ready || busy} onClick={execute}>{busy ? 'Publishing…' : 'Publish the set and open pack sales'}</Button>
      )}
      {!busy && Object.values(status).includes('error') && !inProgress && (
        <Button className="w-full" variant="outline" onClick={execute} disabled={!ready}>Retry the failed step</Button>
      )}

      {published && (
        <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <div className="font-semibold">Set #{published.setId} published</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to={`/gacha/${published.setId}`} className="text-primary hover:underline">View it in the Gacha →</Link>
            {addrUrl(ADDR.collection) && <a className="text-primary hover:underline" href={addrUrl(ADDR.collection)} target="_blank" rel="noreferrer">CardCollection ↗</a>}
            {run.baseUri && <span className="break-all text-fg-muted">{run.baseUri}</span>}
          </div>
          <Button size="sm" variant="outline" onClick={restart}>Create another set</Button>
        </div>
      )}
      <p className="text-[11px] text-fg-muted">
        {STEPS.length} steps · 3 wallet transactions (createSet, setBaseURI, configurePack) and 1 message signature to pin the metadata.
      </p>
    </div>
  )
}
