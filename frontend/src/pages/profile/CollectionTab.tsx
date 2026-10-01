import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace } from '@/components/tc/CardFace'
import { CardDialog } from '@/components/tc/CardDialog'
import { EmptyState, Frame } from '@/components/royal/Ornaments'
import { sendTx, fmtEth, fmtUsd, type CollectionSet, type OwnedCard } from '@/lib/tc'
import { useCollection, useConfig, useEthUsd, useMe, useRefresh } from '@/lib/hooks'
import { Link } from '@/lib/router'

/** Spec UX: warn before setApprovalForAll and say exactly what it grants. */
export function ApprovalGate() {
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-display font-bold tracking-wide text-gold-bright"><ShieldCheck className="size-4" />Approve the Marketplace first</div>
      <p className="mt-1.5 text-fg-subtle">
        <code className="text-ivory">setApprovalForAll(Marketplace, true)</code> lets the Marketplace contract move <b className="text-ivory">any</b> of your cards into escrow when you list them.
        It only grants this to the Marketplace contract, and you can revoke it at any time.
      </p>
      <Button size="sm" className="mt-3" disabled={busy} onClick={async () => {
        setBusy(true)
        try { await sendTx('Approve Marketplace', 'tc/approve', { approved: true }); refresh() } catch { /* toast shown */ } finally { setBusy(false) }
      }}>{busy ? 'Approving…' : 'I understand — approve'}</Button>
    </div>
  )
}

function ListForm({ card, onDone }: { card: OwnedCard; onDone: () => void }) {
  const me = useMe()
  const cfg = useConfig()
  const ethUsd = useEthUsd()
  const refresh = useRefresh()
  const [amount, setAmount] = useState(1)
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  if (card.balance < 1) {
    return <div className="rounded-md bg-bg-subtle p-3 text-sm text-fg-muted">You have no copy left to sell{card.listed ? ` (${card.listed} already listed)` : ''}.</div>
  }
  if (!me.data?.wallet?.marketApproved) return <ApprovalGate />
  const fee = cfg.data?.feeBps ?? 250
  const p = Number(price)
  const net = p * (1 - fee / 10000)
  return (
    <div className="space-y-3 rounded-lg border border-gold/25 bg-night/40 p-4">
      <div className="kicker">List for sale</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-fg-muted">Quantity (you hold {card.balance})
          <Input type="number" min={1} max={card.balance} value={amount} onChange={(e) => setAmount(Math.max(1, Math.min(card.balance, Number(e.target.value) || 1)))} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">Total price (ETH)
          <Input inputMode="decimal" placeholder="0.005" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
        </label>
      </div>
      {p > 0 && (
        <div className="text-sm text-fg-subtle">
          You receive after the {fee / 100}% fee: <span className="font-mono text-ivory">{fmtEth(net, 6)} ETH</span>
          {ethUsd ? ` ≈ ${fmtUsd(net * ethUsd)}` : ''} · {fmtEth(p / amount, 6)} ETH per card
        </div>
      )}
      <Button size="sm" className="w-full" disabled={busy || !(p > 0)} onClick={async () => {
        setBusy(true)
        try { await sendTx(`List ${amount}× ${card.name}`, 'tc/listings', { cardId: card.id, amount, price }); refresh(); onDone() } catch { /* toast shown */ } finally { setBusy(false) }
      }}>{busy ? 'Listing…' : 'List (cards move into escrow)'}</Button>
    </div>
  )
}

function BundleDialog({ set, open, onOpenChange }: { set: CollectionSet; open: boolean; onOpenChange: (o: boolean) => void }) {
  const me = useMe()
  const refresh = useRefresh()
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const main = set.cards.filter((c) => !c.isReward)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="kicker">listBundle</div>
          <DialogTitle>Sell the full set “{set.name}”</DialogTitle>
          <DialogDescription className="text-fg-subtle">One copy of each of the {main.length} cards goes into escrow. The buyer pays once and receives the complete set.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-1.5">{main.map((c) => <CardFace key={c.id} card={c} compact />)}</div>
        {!me.data?.wallet?.marketApproved ? <ApprovalGate /> : (
          <div className="space-y-3">
            <label className="space-y-1 text-xs text-fg-muted">Price for the whole set (ETH)
              <Input inputMode="decimal" placeholder="0.08" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} />
            </label>
            <Button className="w-full" disabled={busy || !(Number(price) > 0)} onClick={async () => {
              setBusy(true)
              try { await sendTx(`List full set ${set.name}`, 'tc/listings/bundle', { setId: set.id, price }); refresh(); onOpenChange(false) } catch { /* toast shown */ } finally { setBusy(false) }
            }}>{busy ? 'Listing…' : 'List the full set'}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SetBlock({ set, onSelect }: { set: CollectionSet; onSelect: (c: OwnedCard) => void }) {
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const [bundle, setBundle] = useState(false)
  const main = set.cards.filter((c) => !c.isReward)
  const reward = set.cards.find((c) => c.isReward)
  const pct = Math.round((set.owned / Math.max(1, set.total)) * 100)
  const dupes = main.reduce((s, c) => s + Math.max(0, c.balance - 1), 0)
  const missing = main.filter((c) => c.balance === 0)
  return (
    <Frame className="p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xl font-bold text-ivory">{set.name}</h2>
            <span className="font-display text-sm tracking-wider text-gold-bright">{set.owned} / {set.total} · {pct}%</span>
            {set.complete && <span className="rounded-sm border border-emerald/50 bg-emerald/15 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.16em] text-[#6fe0b3]">COMPLETE</span>}
            {dupes > 0 && <span className="text-sm text-fg-muted">{dupes} duplicate{dupes > 1 ? 's' : ''}</span>}
          </div>
          <div className="mt-3 h-2 max-w-lg overflow-hidden rounded-full bg-night ring-1 ring-gold/20">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: set.complete ? 'linear-gradient(90deg,#2f9e74,#6fe0b3)' : 'linear-gradient(90deg,#8f6a22,#f6dc95)' }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!set.complete} onClick={() => setBundle(true)}>Sell full set</Button>
          <Button size="sm" disabled={!set.complete || busy} onClick={async () => {
            setBusy(true)
            try { await sendTx(`Redeem ${set.name} for the reward card`, `tc/sets/${set.id}/redeem`); refresh() } catch { /* toast shown */ } finally { setBusy(false) }
          }}>{busy ? 'Forging…' : `Forge reward${reward ? `: ${reward.name}` : ''}`}</Button>
        </div>
      </div>
      {!set.complete && set.owned > 0 && missing.length > 0 && (
        <div className="mt-3 text-sm text-fg-muted">
          Still missing: {missing.map((c) => c.name).join(', ')} · <Link to={`/market?set=${set.id}`} className="text-gold hover:underline">find them at the Marketplace →</Link>
        </div>
      )}
      <div className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
        {set.cards.map((c) => (
          <div key={c.id}>
            <CardFace card={c} count={c.balance} dim={c.balance === 0} onClick={() => onSelect(c)} />
            {c.listed > 0 && <div className="mt-1 text-center font-display text-[9px] tracking-[0.12em] text-gold">{c.listed} LISTED</div>}
          </div>
        ))}
      </div>
      <BundleDialog set={set} open={bundle} onOpenChange={setBundle} />
    </Frame>
  )
}

export default function CollectionTab() {
  const col = useCollection()
  const [sel, setSel] = useState<OwnedCard | null>(null)
  const totalCards = (col.data || []).reduce((s, x) => s + x.cards.reduce((a, c) => a + c.balance, 0), 0)
  const live = sel ? col.data?.flatMap((s) => s.cards).find((c) => c.id === sel.id) || sel : null
  const sets = (col.data || []).filter((s) => s.owned > 0 || s.cards.some((c) => c.balance > 0))

  if (col.isLoading) return <Skeleton className="h-72 rounded-xl" />
  if (col.error) return <EmptyState title="The vault could not be read" body="Your cards could not be loaded from Sepolia right now. Try again shortly." />
  if (totalCards === 0) {
    return (
      <EmptyState title="No cards yet" body="Open a pack in the Gacha hall or pick up singles at the Marketplace."
        action={<><Button asChild><a href="#/gacha">Open packs</a></Button><Button asChild variant="outline"><a href="#/market">Visit the Marketplace</a></Button></>} />
    )
  }
  return (
    <div className="space-y-6">
      <p className="text-fg-subtle">{totalCards} card{totalCards > 1 ? 's' : ''} in your vault. Click a card for its history or to list it for sale; complete a set to forge its reward card.</p>
      {sets.map((s) => <SetBlock key={s.id} set={s} onSelect={setSel} />)}
      <CardDialog card={live} open={!!sel} onOpenChange={(o) => !o && setSel(null)}
        actions={live ? <ListForm card={live} onDone={() => setSel(null)} /> : null} />
    </div>
  )
}
