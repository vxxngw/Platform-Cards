import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState, Frame, Stat } from '@/components/royal/Ornaments'
import { connectNewWallet } from '@/components/tc/Shell'
import { sendTx, fmtEth, short, useWalletStore } from '@/lib/tc'
import { addrUrl } from '@/lib/chain/config'
import { useWalletKind } from '@/lib/chain/wallet'
import { useCollection, useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'
import { cn } from '@/lib/utils'
import CollectionTab from './profile/CollectionTab'
import PacksTab from './profile/PacksTab'
import ActivityTab from './profile/ActivityTab'

export type ProfileTab = 'collection' | 'packs' | 'activity'

/** A sigil generated from the address: two hues and a rotated gem. */
function Sigil({ address }: { address: string }) {
  const n = parseInt(address.slice(2, 10), 16)
  const h1 = n % 360
  const h2 = (h1 + 140) % 360
  return (
    <div className="relative size-20 shrink-0 rounded-full p-[3px]" style={{ background: 'linear-gradient(160deg,#f6dc95,#8f6a22 45%,#d6ab52)' }}>
      <div className="flex h-full w-full items-center justify-center rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, hsl(${h1} 60% 45%), hsl(${h2} 55% 18%) 70%)` }}>
        <div className="size-7 rotate-45 border-2 border-gold-bright/80" style={{ background: `hsl(${h1} 70% 60% / .35)` }} />
      </div>
    </div>
  )
}

export default function Profile({ tab }: { tab: ProfileTab }) {
  const { current } = useWalletStore()
  const me = useMe()
  const col = useCollection()
  const kind = useWalletKind()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)

  if (!current) {
    return (
      <EmptyState title="Your vault is sealed" body="Connect a wallet (or sign in with email) to see your cards, sealed packs and activity."
        action={<Button onClick={() => connectNewWallet().then(refresh).catch(() => {})}>Connect wallet</Button>} />
    )
  }
  const w = me.data?.wallet
  const pending = Number(w?.pending || 0)
  const cards = (col.data || []).reduce((s, x) => s + x.cards.reduce((a, c) => a + c.balance, 0), 0)
  const complete = (col.data || []).filter((s) => s.complete).length
  const sealed = (me.data?.unopened || []).reduce((s, u) => s + u.count, 0)
  const awaiting = me.data?.pendingRequests?.length ?? 0

  async function withdraw() {
    setBusy(true)
    try { await sendTx('Withdraw sale proceeds', 'tc/withdraw'); refresh() } catch { /* toast shown */ } finally { setBusy(false) }
  }

  const tabs: { id: ProfileTab; label: string; badge?: number }[] = [
    { id: 'collection', label: 'Collection' },
    { id: 'packs', label: 'Packs', badge: sealed + awaiting },
    { id: 'activity', label: 'Activities' },
  ]

  return (
    <div className="space-y-8">
      <Frame strong className="overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(75,47,143,.45),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-6">
          <Sigil address={current} />
          <div className="min-w-0 flex-1">
            <div className="kicker mb-1">{w?.isAdmin ? 'Royal Administrator' : 'Collector'}</div>
            <h1 className="gold-text text-3xl font-black md:text-4xl">Your Vault</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-subtle">
              <span className="font-mono">{short(current, 10)}</span>
              <button className="text-fg-muted hover:text-gold-bright" onClick={() => { navigator.clipboard?.writeText(current); toast('Address copied') }} aria-label="Copy address"><Copy className="size-3.5" /></button>
              {addrUrl(current) && <a href={addrUrl(current)} target="_blank" rel="noreferrer" className="text-fg-muted hover:text-gold-bright" aria-label="View on Etherscan"><ExternalLink className="size-3.5" /></a>}
              <span className="rounded-sm border border-gold/30 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.16em] text-gold">{kind === 'privy' ? 'EMAIL WALLET' : 'EXTERNAL WALLET'}</span>
            </div>
          </div>
          {pending > 0 && (
            <div className="rounded-lg border border-emerald/50 bg-emerald/10 px-4 py-3">
              <div className="font-display text-[10px] tracking-[0.2em] text-[#6fe0b3]">SALE PROCEEDS</div>
              <div className="font-display text-xl font-bold text-ivory">{fmtEth(pending, 6)} ETH</div>
              <Button size="sm" className="mt-2 w-full" disabled={busy} onClick={withdraw}>{busy ? 'Withdrawing…' : 'Withdraw'}</Button>
            </div>
          )}
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-6 border-t border-gold/15 pt-6 md:grid-cols-4">
          <Stat label="Balance" value={w ? `${fmtEth(w.balance, 4)} ETH` : undefined} />
          <Stat label="Cards owned" value={col.data ? cards.toLocaleString() : undefined} />
          <Stat label="Sets completed" value={col.data ? `${complete} / ${col.data.length}` : undefined} />
          <Stat label="Sealed packs" value={me.data ? sealed.toLocaleString() : undefined} />
        </div>
      </Frame>

      <nav className="flex gap-1 overflow-x-auto border-b border-gold/20">
        {tabs.map((t) => (
          <Link key={t.id} to={`/profile?tab=${t.id}`}
            className={cn('relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3 font-display text-sm font-bold tracking-[0.14em] uppercase transition',
              tab === t.id ? 'border-gold text-gold-bright' : 'border-transparent text-fg-subtle hover:text-ivory')}>
            {t.label}
            {!!t.badge && <span className="rounded-full bg-crimson px-1.5 font-sans text-[10px] tracking-normal text-ivory ring-1 ring-gold/50">{t.badge}</span>}
          </Link>
        ))}
      </nav>

      {tab === 'collection' && <CollectionTab />}
      {tab === 'packs' && <PacksTab />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  )
}
