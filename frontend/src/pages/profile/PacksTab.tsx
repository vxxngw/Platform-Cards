import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardBack } from '@/components/tc/CardFace'
import { EmptyState, Frame, SectionHeader } from '@/components/royal/Ornaments'
import { PackArt } from '@/components/royal/PackArt'
import { usePackOpener } from '@/components/royal/PackOpenDialog'
import { http, short, timeAgo, useWalletStore, RARITY_COLOR, RARITY_NAMES, type OpenRequest } from '@/lib/tc'
import { MAX_PACKS_PER_TX } from '@/lib/chain/config'
import { useMe, useSets } from '@/lib/hooks'

export default function PacksTab() {
  const { current } = useWalletStore()
  const me = useMe()
  const sets = useSets()
  const opener = usePackOpener()
  const reqs = useQuery({ queryKey: ['requests', current], queryFn: () => http<OpenRequest[]>('tc/packs/requests'), enabled: !!current, refetchInterval: 15000 })

  const unopened = me.data?.unopened || []
  const awaiting = (reqs.data || []).filter((r) => r.status === 'pending' || r.status === 'ready')
  const history = (reqs.data || []).filter((r) => r.status === 'fulfilled')
  const setOf = (id: number) => sets.data?.find((s) => s.id === id)

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <SectionHeader kicker="Your Treasury" title="Sealed Packs" sub="Packs you bought but have not opened yet. Break the seal whenever you are ready." />
        {me.isLoading ? <Skeleton className="h-64 rounded-xl" /> : unopened.length === 0 ? (
          <EmptyState title="No sealed packs" body="Every pack you own has been opened. Claim more in the Gacha hall."
            action={<Button asChild><a href="#/gacha">Go to the Gacha</a></Button>} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {unopened.map((u) => {
              const set = setOf(u.setId)
              return (
                <Frame key={u.setId} className="flex flex-col items-center p-5 text-center">
                  <div className="w-36">{set ? <PackArt set={set} count={u.count} /> : <CardBack />}</div>
                  <div className="mt-4 font-display font-bold text-ivory">{u.name}</div>
                  <div className="text-sm text-fg-muted">{u.count} sealed pack{u.count > 1 ? 's' : ''}</div>
                  <Button size="sm" className="mt-4 w-full" onClick={() => opener.openPacks(u.setId, Math.min(u.count, MAX_PACKS_PER_TX))}>Break the seal</Button>
                </Frame>
              )
            })}
          </div>
        )}
      </section>

      {awaiting.length > 0 && (
        <section className="space-y-5">
          <SectionHeader kicker="Consulting the Oracle" title="Awaiting Chainlink VRF" sub="Openings whose randomness is on its way, or whose cards are ready to claim." />
          <div className="grid gap-4 md:grid-cols-2">
            {awaiting.map((r) => (
              <Frame key={String(r.reqId)} corners={false} className="flex items-center gap-4 p-4">
                <div className="flex shrink-0 gap-1">{[0, 1, 2].map((i) => <div key={i} className="w-8"><CardBack className={r.status === 'ready' ? 'animate-glow' : ''} /></div>)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold text-ivory">{r.setName ?? `Set #${r.setId}`} · {r.count} pack{r.count > 1 ? 's' : ''}</div>
                  <div className="text-sm text-fg-muted">{r.status === 'ready' ? 'Cards ready to claim' : 'Waiting for randomness'} · {timeAgo(r.createdAt)}</div>
                  <div className="font-mono text-[10px] text-fg-muted">request {short(String(r.reqId), 8)}</div>
                </div>
                <Button size="sm" variant={r.status === 'ready' ? 'default' : 'outline'} onClick={() => opener.resume(r.reqId)}>{r.status === 'ready' ? 'Claim cards' : 'Watch'}</Button>
              </Frame>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-5">
        <SectionHeader kicker="The Archive" title="Past Openings" sub="Your most recent openings. Replay one to see every card you pulled." />
        {reqs.isLoading ? <Skeleton className="h-40 rounded-xl" /> : history.length === 0 ? (
          <Frame corners={false} className="px-6 py-8 text-center text-fg-muted">No openings yet.</Frame>
        ) : (
          <Frame corners={false} className="divide-y divide-gold/10 overflow-hidden">
            {history.map((h) => {
              const best = [...h.cards].sort((a, b) => b.rarity - a.rarity)[0]
              return (
                <button key={String(h.reqId)} onClick={() => opener.resume(h.reqId, { revealed: true })}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-gold/5">
                  <span className="flex gap-1">
                    {h.cards.slice(0, 10).map((c, i) => <span key={i} className="size-2 rotate-45" style={{ background: RARITY_COLOR[c.rarity] }} title={c.name} />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ivory">{h.setName ?? `Set #${h.setId}`} · {h.count} pack{h.count > 1 ? 's' : ''}</span>
                    {best && <span className="block truncate text-sm text-fg-muted">Best: <span style={{ color: RARITY_COLOR[best.rarity] }}>{best.name} ({RARITY_NAMES[best.rarity]})</span></span>}
                  </span>
                  <span className="shrink-0 text-sm text-fg-muted">{timeAgo(h.createdAt)}</span>
                  <span className="shrink-0 font-display text-[11px] tracking-[0.14em] text-gold">REPLAY</span>
                </button>
              )
            })}
          </Frame>
        )}
      </section>
      {opener.dialog}
    </div>
  )
}
