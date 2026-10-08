import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardFace } from '@/components/tc/CardFace'
import { CardDialog } from '@/components/tc/CardDialog'
import { EmptyState, Frame, SectionHeader } from '@/components/royal/Ornaments'
import { PackArt } from '@/components/royal/PackArt'
import { OddsNotes, OddsTable } from '@/components/royal/Odds'
import { useBuyAndOpen } from '@/components/royal/PackOpenDialog'
import { http, fmtEth, fmtUsd, useWalletStore, RARITY_COLOR, RARITY_NAMES, type Card, type CardSet } from '@/lib/tc'
import { MAX_PACKS_PER_TX } from '@/lib/chain/config'
import { useEthUsd, useMe } from '@/lib/hooks'
import { Link } from '@/lib/router'

export default function GachaDetail({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['set', id], queryFn: () => http<CardSet>(`tc/sets/${id}`) })
  const me = useMe()
  const { current } = useWalletStore()
  const ethUsd = useEthUsd()
  const gacha = useBuyAndOpen()
  const [qty, setQty] = useState(1)
  const [sel, setSel] = useState<Card | null>(null)

  if (q.isLoading) return <Skeleton className="h-[600px] rounded-xl" />
  if (!q.data) return <EmptyState title="This set does not exist" action={<Button asChild variant="outline"><a href="#/gacha">Back to the Gacha</a></Button>} />
  const s = q.data
  const p = s.pack
  const total = p ? Number(p.price) * qty : 0
  const balance = Number(me.data?.wallet?.balance || 0)
  const sealed = me.data?.unopened?.find((u) => u.setId === s.id)?.count || 0
  const main = s.cards.filter((c) => !c.isReward).sort((a, b) => b.rarity - a.rarity || a.id - b.id)
  const reward = s.cards.find((c) => c.isReward)
  const lacking = !!current && !!me.data?.wallet && balance < total
  const tiers = [3, 2, 1, 0].map((r) => ({ r, cards: main.filter((c) => c.rarity === r) })).filter((t) => t.cards.length)

  return (
    <div className="space-y-10">
      <div className="font-display text-xs tracking-[0.18em] text-fg-muted">
        <Link to="/gacha" className="hover:text-gold-bright">GACHA</Link> <span className="mx-1 text-gold/60">◆</span> <span className="text-fg-subtle">{s.name.toUpperCase()}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <Frame strong className="grid items-center gap-8 overflow-hidden p-6 sm:grid-cols-[200px_1fr] md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(75,47,143,.4),transparent_60%)]" />
            <div className="relative mx-auto w-44 sm:w-full"><PackArt set={s} count={sealed} className="animate-float" /></div>
            <div className="relative">
              <div className="kicker mb-2">Royal Set #{s.id}</div>
              <h1 className="gold-text text-3xl font-black md:text-4xl">{s.name}</h1>
              {s.description && <p className="mt-2 text-fg-subtle">{s.description}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <span key={t.r} className="rounded-sm border px-2 py-1 font-display text-[10px] font-bold tracking-[0.16em]" style={{ color: RARITY_COLOR[t.r], borderColor: `${RARITY_COLOR[t.r]}55` }}>
                    {t.cards.length} {RARITY_NAMES[t.r].toUpperCase()}
                  </span>
                ))}
                {reward && <span className="rounded-sm border border-[#ff5c8a55] px-2 py-1 font-display text-[10px] font-bold tracking-[0.16em] text-[#ff5c8a]">1 REWARD</span>}
              </div>
            </div>
          </Frame>

          <section className="space-y-5">
            <SectionHeader kicker="The Card Pool" title="What Awaits Inside" sub="Every card of the set with its minted supply. Click a card for its details and trade history." />
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {main.map((c) => (
                <div key={c.id}>
                  <CardFace card={c} onClick={() => setSel(c)} />
                  <div className="mt-1.5 truncate text-sm text-ivory">{c.name}</div>
                  <div className="font-mono text-[10px] text-fg-muted">{c.supply.toLocaleString()} / {c.maxSupply.toLocaleString()} minted</div>
                </div>
              ))}
            </div>
          </section>

          {reward && (
            <Frame className="flex flex-col items-center gap-6 p-6 sm:flex-row">
              <div className="w-32 shrink-0"><CardFace card={reward} onClick={() => setSel(reward)} /></div>
              <div>
                <div className="kicker mb-1">The Crown Jewel</div>
                <h3 className="text-xl font-bold text-ivory">Reward card: {reward.name}</h3>
                <p className="mt-2 text-fg-subtle">
                  Never found in packs. Gather one of each of the {main.length} cards, then burn the full set in your Profile to forge it.
                  {' '}{reward.supply.toLocaleString()} of {reward.maxSupply.toLocaleString()} forged so far.
                </p>
                <Button asChild variant="link" className="mt-1 px-0"><a href="#/profile?tab=collection">Check your progress →</a></Button>
              </div>
            </Frame>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Frame strong className="p-6">
            <div className="kicker">Price per pack · 5 cards</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-4xl font-black text-gold-bright">{p ? fmtEth(p.price) : '—'}</span>
              <span className="font-display tracking-widest text-fg-subtle">ETH</span>
            </div>
            {p && ethUsd && <div className="text-sm text-fg-muted">≈ {fmtUsd(Number(p.price) * ethUsd)} (testnet ETH)</div>}
            <div className="mt-1 text-sm text-fg-muted">{p?.remaining.toLocaleString() ?? 0} packs left · up to {MAX_PACKS_PER_TX} per transaction</div>

            <div className="my-6 flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.max(1, x - 1))} aria-label="Fewer packs"><Minus /></Button>
              <div className="flex-1 text-center">
                <div className="font-display text-4xl font-black text-ivory">{qty}</div>
                <div className="font-display text-[10px] tracking-[0.2em] text-fg-muted">PACK{qty > 1 ? 'S' : ''}</div>
              </div>
              <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.min(MAX_PACKS_PER_TX, x + 1))} aria-label="More packs"><Plus /></Button>
            </div>
            <div className="flex justify-between border-t border-gold/15 pt-3 text-sm">
              <span className="text-fg-muted">Total</span>
              <span className="font-display font-bold text-ivory">{fmtEth(total, 6)} ETH</span>
            </div>
            {lacking && <div className="mt-3 rounded border border-destructive/40 bg-crimson/20 px-3 py-2 text-sm text-[#ffb3b8]">Not enough ETH (balance {fmtEth(balance)}). Use the Sepolia faucet from the wallet menu.</div>}
            {p && !p.onSale && <div className="mt-3 rounded border border-gold/20 bg-bg-subtle px-3 py-2 text-sm text-fg-muted">Packs of this set are not on sale right now.</div>}
            <Button size="lg" className="mt-5 w-full" disabled={gacha.busySet === s.id || !p?.onSale || lacking || (p?.remaining ?? 0) < qty} onClick={() => gacha.buy(s, qty)}>
              <Sparkles /> {gacha.busySet === s.id ? 'Summoning…' : current ? `Buy & open ${qty} pack${qty > 1 ? 's' : ''}` : 'Connect wallet to buy'}
            </Button>
            {sealed > 0 && (
              <Button variant="outline" className="mt-2 w-full" onClick={() => gacha.openPacks(s.id, Math.min(sealed, MAX_PACKS_PER_TX))}>
                Open my {sealed} sealed pack{sealed > 1 ? 's' : ''}
              </Button>
            )}
          </Frame>
          <Frame className="space-y-4 p-6">
            <div className="kicker">Drop rates per card</div>
            <OddsTable />
            <OddsNotes />
          </Frame>
        </aside>
      </div>
      <CardDialog card={sel} open={!!sel} onOpenChange={(o) => !o && setSel(null)} />
      {gacha.dialog}
    </div>
  )
}
