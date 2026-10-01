import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { ArrowRight, Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Frame, PageHero } from '@/components/royal/Ornaments'
import { Chronicle } from '@/components/royal/Chronicle'
import { http, sendTx, fmtEth, useWalletStore, type CardSet } from '@/lib/tc'
import { connectNewWallet } from '@/components/tc/Shell'
import { useConfig, useMe, useRefresh, useSets } from '@/lib/hooks'

function PackRow({ s }: { s: CardSet }) {
  const refresh = useRefresh()
  const [price, setPrice] = useState(s.pack?.price ?? '0.01')
  const [supply, setSupply] = useState(String(s.pack?.remaining ?? 1000))
  const [busy, setBusy] = useState(false)
  const save = async (onSale: boolean) => {
    setBusy(true)
    try { await sendTx(`configurePack set #${s.id}`, `tc/sets/${s.id}/pack`, { price, supply: Number(supply), onSale }); refresh() } catch { /* toast shown */ } finally { setBusy(false) }
  }
  return (
    <div className="grid grid-cols-[1fr_110px_110px_auto] items-center gap-2 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="truncate font-display font-bold text-ivory">#{s.id} {s.name}</div>
        <div className="text-xs text-fg-muted">{s.pack ? `${s.pack.total - s.pack.remaining} sold · ${s.pack.onSale ? 'on sale' : 'closed'}` : 'not configured'}</div>
      </div>
      <Input className="h-8" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} aria-label="Price in ETH" />
      <Input className="h-8" value={supply} onChange={(e) => setSupply(e.target.value)} aria-label="Packs remaining" />
      <div className="flex gap-1">
        <Button size="sm" disabled={busy} onClick={() => save(true)}>{s.pack?.onSale ? 'Save' : 'Open sale'}</Button>
        {s.pack?.onSale && <Button size="sm" variant="outline" disabled={busy} onClick={() => save(false)}>Close</Button>}
      </div>
    </div>
  )
}

type Diag = Record<string, unknown>
const errOf = (v: unknown) => (v && typeof v === 'object' && 'error' in v ? String((v as { error: unknown }).error) : null)

/** Shown instead of the admin tools when the connected wallet is not recognised: every check, its result and the fix. */
function AccessCheck() {
  const { current } = useWalletStore()
  const q = useQuery({ queryKey: ['diagnostics', current], queryFn: () => http<Diag>('tc/diagnostics'), retry: 0 })
  const d = q.data
  const lower = (v: unknown) => String(v ?? '').toLowerCase()
  const rows: { label: string; ok: boolean | null; value: string; fix?: string }[] = d ? [
    { label: 'Wallet connected', ok: !!d.connected, value: String(d.connected ?? 'none'), fix: 'Connect the deployer wallet as an external wallet (MetaMask) in the Privy modal — an email sign-in creates a different address.' },
    { label: 'Matches VITE_ADMIN_ADDRESS', ok: d.adminAddressEnv ? lower(d.connected) === lower(d.adminAddressEnv) : null, value: String(d.adminAddressEnv ?? 'not set'), fix: 'Switch MetaMask to the deployer account, or correct VITE_ADMIN_ADDRESS and redeploy.' },
    { label: 'RPC network', ok: errOf(d.rpcChainId) ? false : d.rpcChainId === d.expectedChainId, value: errOf(d.rpcChainId) ?? `chain ${d.rpcChainId} (expected ${d.expectedChainId}) · ${d.rpc}`, fix: 'VITE_RPC_URL must be a Sepolia endpoint (chain 11155111) that answers from the browser. Leave it empty to use the public default.' },
    { label: 'CardCollection deployed at VITE_COLLECTION_ADDRESS', ok: errOf(d.collectionDeployed) ? false : d.collectionDeployed === true, value: errOf(d.collectionDeployed) ?? String(d.collection), fix: 'Check VITE_COLLECTION_ADDRESS against contracts/deployments.sepolia.json and redeploy.' },
    { label: 'Wallet holds ADMIN_ROLE', ok: d.connected ? (errOf(d.hasAdminRole) ? false : d.hasAdminRole === true) : null, value: errOf(d.hasAdminRole) ?? String(d.hasAdminRole ?? '—'), fix: 'Only the deployer (or a wallet granted ADMIN_ROLE on CardCollection) can manage the realm.' },
    { label: 'Event logs readable', ok: !errOf(d.eventLogs), value: errOf(d.eventLogs) ?? String(d.eventLogs), fix: 'Sets, listings and history need eth_getLogs. Set VITE_LOGS_RPC_URL to an endpoint with a wide getLogs range, or check VITE_DEPLOY_BLOCK.' },
  ] : []
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <EmptyState title="The throne room is closed" body="This wallet was not recognised as an admin. The checks below show which step fails."
        action={!current ? <Button onClick={() => connectNewWallet().catch(() => {})}>Connect wallet</Button> : undefined} />
      <Frame className="p-5">
        <div className="kicker mb-3">Access check</div>
        {q.isLoading && <div className="text-fg-muted">Running checks…</div>}
        {q.error && <div className="text-destructive">{(q.error as Error).message}</div>}
        <div className="divide-y divide-gold/10">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3 py-3 text-sm">
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${r.ok === null ? 'bg-fg-muted/20 text-fg-muted' : r.ok ? 'bg-emerald/25 text-[#6fe0b3]' : 'bg-crimson/40 text-[#ffb3b8]'}`}>
                {r.ok === null ? '–' : r.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-ivory">{r.label}</div>
                <div className="break-all font-mono text-xs text-fg-muted">{r.value}</div>
                {r.ok === false && r.fix && <div className="mt-1 text-fg-subtle">{r.fix}</div>}
              </div>
            </div>
          ))}
        </div>
      </Frame>
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
    if (me.isLoading) return <EmptyState title="Checking your seal…" body="Reading ADMIN_ROLE from the CardCollection contract." />
    return <AccessCheck />
  }
  const c = cfg.data
  const run = async (label: string, path: string, body: unknown = {}) => {
    setBusy(true)
    try { await sendTx(label, path, body); refresh() } catch { /* toast shown */ } finally { setBusy(false) }
  }
  const revenue = Number(c?.packRevenue || 0) + Number(c?.marketFees || 0)

  return (
    <div className="space-y-8">
      <PageHero kicker="The Throne Room" title="Administration" sub="The deployer wallet holds ADMIN_ROLE on all three contracts; PackSale holds MINTER_ROLE on CardCollection.">
        <Button asChild size="lg"><a href="#/admin/pack-builder"><Hammer /> Open the Pack Builder</a></Button>
      </PageHero>

      <div className="grid gap-5 md:grid-cols-3">
        <Frame className="p-5">
          <div className="kicker">Treasury</div>
          <div className="mt-2 font-display text-3xl font-bold text-gold-bright">{fmtEth(revenue, 6)} ETH</div>
          <div className="mt-1 text-sm text-fg-muted">Packs {fmtEth(c?.packRevenue || 0, 6)} · fees {fmtEth(c?.marketFees || 0, 6)}</div>
          <Button size="sm" className="mt-4" disabled={busy || revenue <= 0} onClick={() => run('Withdraw revenue', 'tc/admin/withdraw')}>withdraw()</Button>
        </Frame>
        <Frame className="p-5">
          <div className="kicker">Contract state</div>
          <div className={`mt-2 font-display text-3xl font-bold ${c?.paused ? 'text-destructive' : 'text-[#6fe0b3]'}`}>{c?.paused ? 'Paused' : 'Active'}</div>
          <div className="mt-1 text-sm text-fg-muted">Pausing halts pack sales and openings, card transfers, listings, trades and redemptions.</div>
          <Button size="sm" variant={c?.paused ? 'default' : 'destructive'} className="mt-4" disabled={busy}
            onClick={() => run(c?.paused ? 'unpause()' : 'pause()', 'tc/admin/pause', { paused: !c?.paused })}>{c?.paused ? 'unpause()' : 'pause()'}</Button>
        </Frame>
        <Frame className="p-5">
          <div className="kicker">Marketplace fee</div>
          <div className="mt-2 font-display text-3xl font-bold text-ivory">{(c?.feeBps ?? 0) / 100}% <span className="text-sm text-fg-muted">({c?.feeBps} bps)</span></div>
          <div className="mt-4 flex gap-2">
            <Input className="h-8" placeholder="bps, max 1000" value={fee} onChange={(e) => setFee(e.target.value)} />
            <Button size="sm" disabled={busy || fee === ''} onClick={() => run('setFee', 'tc/admin/fee', { bps: Number(fee) }).then(() => setFee(''))}>setFee</Button>
          </div>
        </Frame>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Frame className="p-5">
            <div className="kicker mb-3">Pack sales</div>
            <div className="grid grid-cols-[1fr_110px_110px_auto] gap-2 font-display text-[10px] tracking-[0.16em] text-fg-muted"><span>SET</span><span>PRICE (ETH)</span><span>PACKS LEFT</span><span /></div>
            <div className="divide-y divide-gold/10">{(sets.data || []).map((s) => <PackRow key={`${s.id}-${s.pack?.price}-${s.pack?.remaining}`} s={s} />)}</div>
            {sets.data?.length === 0 && <div className="py-6 text-center text-fg-muted">No set yet.</div>}
          </Frame>
          <Frame className="flex items-center justify-between gap-4 p-5">
            <div>
              <div className="font-display font-bold text-ivory">Forge a new set</div>
              <p className="text-sm text-fg-subtle">Browse Pokémon TCG cards on TCGdex, pick 11 cards plus a reward card, and publish the set and its packs in minutes. Hand-entered cards are supported as a fallback.</p>
            </div>
            <Button asChild variant="outline"><a href="#/admin/pack-builder">Pack Builder <ArrowRight /></a></Button>
          </Frame>
        </div>
        <Chronicle limit={15} />
      </div>
    </div>
  )
}
