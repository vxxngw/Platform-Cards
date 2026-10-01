import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Crown, Gem, Store, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardBack, CardFace } from '@/components/tc/CardFace'
import { Crest, Divider, Frame, SectionHeader, Stat } from '@/components/royal/Ornaments'
import { PackTile } from '@/components/royal/PackTile'
import { OddsNotes, OddsTable } from '@/components/royal/Odds'
import { Chronicle } from '@/components/royal/Chronicle'
import { useBuyAndOpen } from '@/components/royal/PackOpenDialog'
import { http, fmtEth, short, timeAgo, RARITY_COLOR, RARITY_NAMES, type Card } from '@/lib/tc'
import type { Pull } from '@/lib/chain/adapter'
import { useMe, useSets } from '@/lib/hooks'
import { BRAND } from '@/lib/brand'

type Stats = { packsSold: number; sales: number; volume: string; activeListings: number; wallets: number }

function HeroCards({ cards }: { cards: Card[] }) {
  const slots = [0, 1, 2]
  return (
    <div className="relative mx-auto h-[340px] w-[300px] sm:h-[400px] sm:w-[360px]">
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(214,171,82,.28),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-dashed border-gold/25 sm:size-[360px]" />
      {slots.map((i) => {
        const c = cards[i]
        const pos = [
          'left-0 top-14 -rotate-[14deg]',
          'left-1/2 top-0 z-10 -translate-x-1/2',
          'right-0 top-14 rotate-[14deg]',
        ][i]
        return (
          <div key={i} className={`absolute w-[42%] animate-float ${pos}`} style={{ animationDelay: `${i * 0.8}s` }}>
            {c ? <CardFace card={c} quality="high" /> : <CardBack />}
          </div>
        )
      })}
    </div>
  )
}

const STEPS = [
  { n: 'I', icon: Crown, title: 'Claim a Pack', body: 'Buy sealed packs with Sepolia ETH. Each holds five cards from one royal set.' },
  { n: 'II', icon: Wand2, title: 'Break the Seal', body: 'Chainlink VRF draws your cards. The fifth is always Rare or better.' },
  { n: 'III', icon: Gem, title: 'Complete the Set', body: 'Collect all eleven cards, then burn one of each to forge the reward card.' },
  { n: 'IV', icon: Store, title: 'Trade at the Bazaar', body: 'List duplicates or whole sets on the Marketplace. Sellers pay a 2.5% fee.' },
]

export default function Home() {
  const sets = useSets()
  const me = useMe()
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => http<Stats>('tc/stats'), refetchInterval: 30000 })
  const pulls = useQuery({ queryKey: ['pulls'], queryFn: () => http<Pull[]>('tc/pulls?limit=12'), refetchInterval: 30000 })
  const gacha = useBuyAndOpen()

  const showcase = (sets.data || [])
    .flatMap((s) => s.cards.filter((c) => !c.isReward))
    .sort((a, b) => b.rarity - a.rarity || a.id - b.id)
  const heroCards = [showcase[1], showcase[0], showcase[2]].filter(Boolean) as Card[]
  const onSale = (sets.data || []).filter((s) => s.pack?.onSale).slice(0, 3)
  const featured = onSale.length ? onSale : (sets.data || []).slice(0, 3)
  const owned = (id: number) => me.data?.unopened?.find((u) => u.setId === id)?.count ?? 0

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative grid items-center gap-10 pt-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="kicker mb-4 flex items-center gap-3"><span className="h-px w-10 bg-gold/60" />Sepolia Testnet · Chainlink VRF</div>
          <h1 className="text-4xl font-black leading-[1.05] text-ivory sm:text-5xl lg:text-6xl">
            Claim your <span className="gold-shimmer">legend</span>,<br />one sealed pack at a time.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-subtle">
            {BRAND} is a royal exchange for collectible cards: open packs with provable randomness, complete sets to forge reward cards, and trade every card peer to peer — all on chain.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><a href="#/gacha">Enter the Gacha <ArrowRight /></a></Button>
            <Button asChild size="lg" variant="outline"><a href="#/market">Browse the Marketplace</a></Button>
          </div>
        </div>
        <HeroCards cards={heroCards} />
      </section>

      {/* Treasury stats */}
      <Frame strong className="grid grid-cols-2 gap-6 px-6 py-6 md:grid-cols-4 md:px-10">
        <Stat label="Packs claimed" value={stats.data?.packsSold?.toLocaleString()} />
        <Stat label="Market trades" value={stats.data?.sales?.toLocaleString()} />
        <Stat label="Trade volume" value={stats.data ? `${fmtEth(stats.data.volume, 3)} ETH` : undefined} />
        <Stat label="Cards on the market" value={stats.data?.activeListings?.toLocaleString()} />
      </Frame>

      {/* Featured packs */}
      <section className="space-y-6">
        <SectionHeader kicker="The Royal Treasury" title="Featured Packs" sub="Sealed boosters from real Pokémon TCG sets, minted as testnet cards when you open them."
          action={<Button asChild variant="outline" size="sm"><a href="#/gacha">All packs <ArrowRight /></a></Button>} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sets.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-xl" />)}
          {featured.map((s) => <PackTile key={s.id} set={s} owned={owned(s.id)} busy={gacha.busySet === s.id} onQuickBuy={() => gacha.buy(s, 1)} />)}
          {sets.data && sets.data.length === 0 && (
            <Frame className="col-span-full px-6 py-12 text-center text-fg-subtle">No set has been forged yet. An admin can create one with the Pack Builder.</Frame>
          )}
          {sets.error && <Frame className="col-span-full px-6 py-12 text-center text-fg-subtle">The treasury could not be read from Sepolia right now. Try again shortly.</Frame>}
        </div>
      </section>

      {/* Latest pulls */}
      <section className="space-y-6">
        <SectionHeader kicker="Fresh from the forge" title="Latest Pulls" sub="The best card of each recent opening, across every player." />
        {pulls.isLoading ? (
          <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-60 w-40 shrink-0 rounded-xl" />)}</div>
        ) : (pulls.data || []).length === 0 ? (
          <Frame className="px-6 py-10 text-center text-fg-subtle">No pack has been opened yet — yours could be the first.</Frame>
        ) : (
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3">
            {pulls.data!.map((p) => {
              const best = [...p.cards].sort((a, b) => b.rarity - a.rarity)[0]
              if (!best) return null
              return (
                <div key={p.reqId} className="w-40 shrink-0">
                  <CardFace card={best} />
                  <div className="mt-2 truncate text-sm text-ivory">{best.name}</div>
                  <div className="flex items-center justify-between font-display text-[10px] tracking-[0.12em]">
                    <span style={{ color: RARITY_COLOR[best.rarity] }}>{RARITY_NAMES[best.rarity].toUpperCase()}</span>
                    <span className="tracking-normal text-fg-muted">{timeAgo(p.at)}</span>
                  </div>
                  <div className="font-mono text-[10px] text-fg-muted">{short(p.buyer)}</div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <SectionHeader kicker="The Royal Path" title="How It Works" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Frame key={s.n} className="p-6">
              <div className="flex items-center justify-between">
                <span className="gold-text font-deco text-4xl font-black">{s.n}</span>
                <span className="flex size-10 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold"><s.icon className="size-5" /></span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-ivory">{s.title}</h3>
              <p className="mt-1.5 text-fg-subtle">{s.body}</p>
            </Frame>
          ))}
        </div>
      </section>

      {/* Odds + chronicle */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Frame className="space-y-5 p-6">
          <div>
            <div className="kicker mb-1">Fortune's Ledger</div>
            <h2 className="text-2xl font-bold text-ivory">Drop Rates</h2>
          </div>
          <OddsTable />
          <Divider />
          <OddsNotes />
          <div className="flex justify-center pt-2"><Crest className="h-14 w-14 opacity-50" /></div>
        </Frame>
        <Chronicle limit={10} />
      </section>
      {gacha.dialog}
    </div>
  )
}
