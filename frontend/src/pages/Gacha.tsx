import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState, Frame, PageHero, SectionHeader } from '@/components/royal/Ornaments'
import { PackTile } from '@/components/royal/PackTile'
import { OddsNotes, OddsTable } from '@/components/royal/Odds'
import { useBuyAndOpen } from '@/components/royal/PackOpenDialog'
import { useMe, useSets } from '@/lib/hooks'

export default function Gacha() {
  const sets = useSets()
  const me = useMe()
  const gacha = useBuyAndOpen()
  const sealed = (me.data?.unopened || []).reduce((s, u) => s + u.count, 0)
  const owned = (id: number) => me.data?.unopened?.find((u) => u.setId === id)?.count ?? 0
  const list = [...(sets.data || [])].sort((a, b) => Number(!!b.pack?.onSale) - Number(!!a.pack?.onSale) || b.id - a.id)

  return (
    <div className="space-y-12">
      <PageHero kicker="The Gacha Hall" title="Choose Your Fate"
        sub="Choose a royal set, buy sealed packs and break the seal on the spot. Every draw is decided by Chainlink VRF and minted straight into your wallet.">
        {sealed > 0 && (
          <Frame className="flex items-center gap-4 px-5 py-4">
            <div>
              <div className="font-display text-[10px] tracking-[0.2em] text-fg-muted">YOUR SEALED PACKS</div>
              <div className="font-display text-3xl font-black text-gold-bright">{sealed}</div>
            </div>
            <Button asChild size="sm"><a href="#/profile?tab=packs">Open them</a></Button>
          </Frame>
        )}
      </PageHero>

      <section className="space-y-6">
        <SectionHeader kicker="Sealed Boosters" title="Packs on the Shelf" sub="“Buy & open” buys one pack and opens it right away; view a pool to buy up to 10 at once." />
        {sets.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-xl" />)}</div>
        ) : sets.error ? (
          <EmptyState title="The shelf is out of reach" body="Packs could not be read from Sepolia right now. Try again shortly." />
        ) : list.length === 0 ? (
          <EmptyState title="No packs forged yet" body="An admin creates sets and packs with the Pack Builder." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => <PackTile key={s.id} set={s} owned={owned(s.id)} busy={gacha.busySet === s.id} onQuickBuy={() => gacha.buy(s, 1)} />)}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Frame className="space-y-4 p-6">
          <div><div className="kicker mb-1">Fortune's Ledger</div><h2 className="text-2xl font-bold text-ivory">Drop Rates per Card</h2></div>
          <OddsTable />
        </Frame>
        <Frame className="space-y-4 p-6">
          <div><div className="kicker mb-1">The Guarantees</div><h2 className="text-2xl font-bold text-ivory">Fair by Design</h2></div>
          <OddsNotes />
        </Frame>
      </section>
      {gacha.dialog}
    </div>
  )
}
