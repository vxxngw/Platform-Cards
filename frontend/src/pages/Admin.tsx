import { useState } from 'react'
import { ArrowRight, Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, Frame, PageHero } from '@/components/royal/Ornaments'
import { Chronicle } from '@/components/royal/Chronicle'
import { sendTx, fmtEth, type CardSet } from '@/lib/tc'
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

export default function Admin() {
  const me = useMe()
  const cfg = useConfig()
  const sets = useSets()
  const refresh = useRefresh()
  const [fee, setFee] = useState('')
  const [busy, setBusy] = useState(false)

  if (!me.data?.wallet?.isAdmin) {
    return <EmptyState title="The throne room is closed" body="This page is for wallets holding ADMIN_ROLE. Connect the deployer wallet to manage the realm." />
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
