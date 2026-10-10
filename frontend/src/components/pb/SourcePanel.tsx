import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { LANGS, getCard, getSet, listRarities, listSets, rarityMapForSet } from '@/lib/pokemon/tcgdex'
import { poolCardFromTcgdex } from '@/lib/pokemon/metadata'
import { suggestTier } from '@/lib/pokemon/tiers'
import type { PoolCard, TcgdexCard, TcgdexCardBrief } from '@/lib/pokemon/types'
import { cn } from '@/lib/utils'
import { Thumb, TierDot } from './parts'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export type PickMode = 'pool' | 'reward'

export function SourcePanel({ lang, setLang, setId, setSetId, poolKeys, rewardKey, mode, setMode, onPick }: {
  lang: string; setLang: (l: string) => void
  setId: string; setSetId: (id: string) => void
  poolKeys: Set<string>; rewardKey: string | null
  mode: PickMode; setMode: (m: PickMode) => void
  onPick: (card: PoolCard) => void
}) {
  const [setSearch, setSetSearch] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [hideUsed, setHideUsed] = useState(false)
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<[number, number] | null>(null)

  const sets = useQuery({ queryKey: ['tcgdex', 'sets', lang], queryFn: () => listSets(lang), staleTime: Infinity })
  const setQ = useQuery({ queryKey: ['tcgdex', 'set', lang, setId], queryFn: () => getSet(lang, setId), enabled: !!setId, staleTime: Infinity })
  const rarities = useQuery({ queryKey: ['tcgdex', 'rarities', lang], queryFn: () => listRarities(lang), staleTime: Infinity })
  const rmap = useQuery({
    queryKey: ['tcgdex', 'rmap', lang, setId],
    queryFn: () => rarityMapForSet(lang, setId, rarities.data!, (d, t) => setProgress(d >= t ? null : [d, t])),
    enabled: !!setId && !!rarities.data,
    staleTime: Infinity,
  })

  const setOptions = useMemo(() => {
    const q = fold(setSearch.trim())
    // TCGdex lists oldest first; the newest sets are the interesting ones
    return [...(sets.data ?? [])].reverse().filter((s) => !q || fold(s.name).includes(q) || s.id.toLowerCase().includes(q)).slice(0, 400)
  }, [sets.data, setSearch])

  const rarityOptions = useMemo(() => {
    const vals = [...new Set(rmap.data?.values() ?? [])]
    return vals.sort((a, b) => (suggestTier(a)?.tier ?? 9) - (suggestTier(b)?.tier ?? 9) || a.localeCompare(b))
  }, [rmap.data])

  const cards = useMemo(() => {
    const q = fold(nameFilter.trim())
    return (setQ.data?.cards ?? []).filter((c) => {
      if (q && !fold(c.name).includes(q) && !c.localId.toLowerCase().includes(q)) return false
      if (rarityFilter && rmap.data?.get(c.id) !== rarityFilter) return false
      if (hideUsed && (poolKeys.has(`${lang}:${c.id}`) || rewardKey === `${lang}:${c.id}`)) return false
      return true
    })
  }, [setQ.data, nameFilter, rarityFilter, hideUsed, rmap.data, poolKeys, rewardKey, lang])

  async function pick(brief: TcgdexCardBrief) {
    const key = `${lang}:${brief.id}`
    if (loading.has(key)) return
    // already chosen → let the parent toggle it without a network round-trip
    setLoading((s) => new Set(s).add(key))
    try {
      let detail: TcgdexCard
      try {
        detail = await getCard(lang, brief.id) // spec v2 §3 step 2: GET /v2/{lang}/cards/<cardId> fills the form
      } catch {
        toast.warning('Could not load the card details from TCGdex', { description: 'Using the set’s summary data; double-check the rarity and tier.' })
        detail = { id: brief.id, localId: brief.localId, name: brief.name, image: brief.image, rarity: rmap.data?.get(brief.id), set: { id: setQ.data!.id, name: setQ.data!.name } }
      }
      onPick(poolCardFromTcgdex(lang, detail))
    } finally {
      setLoading((s) => { const n = new Set(s); n.delete(key); return n })
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">1. Pick cards from TCGdex</div>
          <p className="text-xs text-fg-muted">Data and images from tcgdex.net (free, no key). Images are never copied; they point at assets.tcgdex.net.</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
        <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={lang} onChange={(e) => { setLang(e.target.value); setSetId('') }} aria-label="Language">
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <Input className="h-9" placeholder="Filter sets…" value={setSearch} onChange={(e) => setSetSearch(e.target.value)} aria-label="Filter sets" />
          <select className="h-9 min-w-0 rounded-md border border-border bg-background px-2 text-sm" value={setId} onChange={(e) => setSetId(e.target.value)} aria-label="Set Pokémon" disabled={sets.isLoading}>
            <option value="">{sets.isLoading ? 'Loading sets…' : sets.error ? 'TCGdex unavailable' : '— pick a set —'}</option>
            {setOptions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id}) · {s.cardCount.total} cards</option>)}
          </select>
        </div>
      </div>
      {lang === 'ja' && <p className="text-[11px] text-amber-300">Japanese prints look great, but their set names rarely match Renaiss Index, so reference prices will usually be empty.</p>}
      {sets.error && <p className="text-xs text-destructive">TCGdex is down or blocked. Use “Add a card by hand” or the fallback seed script.</p>}

      {setId && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-border text-xs" role="radiogroup" aria-label="Pick into">
              {([['pool', 'Pack cards'], ['reward', 'Reward card']] as const).map(([m, label]) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cn('px-2.5 py-1.5 font-medium', mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-fg-subtle hover:bg-bg-subtle')}>{label}</button>
              ))}
            </div>
            <Input className="h-8 w-40" placeholder="Search name / number" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} aria-label="Search by name" />
            <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} aria-label="Filter by rarity">
              <option value="">Any rarity</option>
              {rarityOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-fg-subtle"><input type="checkbox" checked={hideUsed} onChange={(e) => setHideUsed(e.target.checked)} />Hide picked cards</label>
            <span className="ml-auto text-[11px] text-fg-muted">
              {setQ.data ? `${cards.length}/${setQ.data.cards.length} cards` : ''}
              {progress ? ` · loading rarities ${progress[0]}/${progress[1]}` : rmap.isError ? ' · rarities unavailable' : ''}
            </span>
          </div>

          {setQ.data && setQ.data.cards.length > 0 && (() => {
            const all = setQ.data.cards
            const noImage = all.filter((c) => !c.image).length
            const noRarity = rmap.data ? all.filter((c) => { const r = rmap.data!.get(c.id); return !r || r.toLowerCase() === 'none' }).length : 0
            if (noImage < all.length / 2 && noRarity < all.length / 2) return null
            return (
              <p className="rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                TCGdex has {noImage >= all.length / 2 ? `no card images for ${noImage} of ${all.length} cards` : ''}{noImage >= all.length / 2 && noRarity >= all.length / 2 ? ' and ' : ''}{noRarity >= all.length / 2 ? `no official rarity (“None”) for ${noRarity} of ${all.length} cards` : ''} in this set yet.
                Sets that are not released yet, or reprint sets, are often incomplete there. You can still use it: pick the cards, then press “Find images” in the pack list to borrow the artwork of an earlier printing, and assign tiers by hand.
                Or pick a set with full data, such as “151” (sv03.5) or “Surging Sparks” (sv08).
              </p>
            )
          })()}
          {setQ.isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[5/7]" />)}</div>
          ) : setQ.error ? (
            <p className="text-sm text-destructive">Could not load this set from TCGdex.</p>
          ) : (
            <div className="grid max-h-[620px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {cards.map((c) => {
                const key = `${lang}:${c.id}`
                const official = rmap.data?.get(c.id)
                const sug = suggestTier(official)
                const inPool = poolKeys.has(key)
                const isReward = rewardKey === key
                return (
                  <button key={c.id} onClick={() => pick(c)} disabled={loading.has(key)} title={`${c.name} · #${c.localId}${official ? ` · ${official}` : ''}`}
                    className={cn('group relative rounded-md text-left transition hover:-translate-y-0.5 disabled:opacity-60', (inPool || isReward) && 'ring-2 ring-primary')}>
                    <Thumb image={c.image} alt={c.name} className="w-full" />
                    <div className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-mono text-white/90">
                      <TierDot tier={sug?.tier ?? null} />#{c.localId}
                    </div>
                    {inPool && <div className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-white"><Check className="size-3" /></div>}
                    {isReward && <div className="absolute right-1 top-1 rounded-full bg-amber-400 p-0.5 text-black"><Star className="size-3" /></div>}
                    <div className="mt-1 truncate text-[11px] leading-tight">{c.name}</div>
                    <div className="truncate text-[10px] text-fg-muted">{official ?? (rmap.isLoading ? '…' : '—')}</div>
                  </button>
                )
              })}
              {cards.length === 0 && <div className="col-span-full py-8 text-center text-sm text-fg-muted">No card matches the filters.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
