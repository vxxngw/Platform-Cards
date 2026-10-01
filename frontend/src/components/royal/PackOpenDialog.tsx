import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Minus, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CardBack, CardFace } from '@/components/tc/CardFace'
import { PackArt } from './PackArt'
import { Divider } from './Ornaments'
import { currentAddress, http, sendTx, short, RARITY_COLOR, RARITY_NAMES, type Card, type OpenRequest } from '@/lib/tc'
import { connectWallet } from '@/lib/chain/wallet'
import { MAX_PACKS_PER_TX, txUrl } from '@/lib/chain/config'
import { useMe, useRefresh, useSets } from '@/lib/hooks'
import { navigate } from '@/lib/router'

const STUCK_AFTER_MS = 3600_000

export function FlipCard({ card, flipped, onFlip, delay }: { card: Card; flipped: boolean; onFlip: () => void; delay: number }) {
  const legendary = card.rarity >= 3
  return (
    <div className="[perspective:1000px]" onClick={onFlip}>
      <div
        className="relative cursor-pointer transition-transform duration-700 [transform-style:preserve-3d]"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transitionDelay: `${delay}ms` }}
      >
        <div className="[backface-visibility:hidden]"><CardBack className={!flipped ? 'hover:border-gold-bright' : ''} /></div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CardFace card={card} className={flipped && legendary ? 'shadow-[0_0_40px_-4px_#f2c14e]' : ''} />
        </div>
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open fresh packs of this set… */
  setId?: number
  /** …or resume / replay an existing VRF request. */
  initialReqId?: string | null
  /** Pre-selected number of packs (e.g. how many were just bought). */
  suggestQty?: number
  /** Show a finished opening with every card already face up (history replay). */
  revealed?: boolean
}

/**
 * The whole unboxing ritual in one dialog: choose how many packs → openPacks (VRF request) → wait for Chainlink VRF →
 * claimPacks (mint) → flip the cards. Closing it at any point is safe: unopened packs and pending requests wait in
 * Profile → Packs.
 */
export function PackOpenDialog({ open, onOpenChange, setId, initialReqId, suggestQty, revealed }: Props) {
  const me = useMe()
  const sets = useSets()
  const refresh = useRefresh()
  const [reqId, setReqId] = useState<string | null>(initialReqId ?? null)
  const [qty, setQty] = useState(Math.max(1, suggestQty ?? 1))
  const [busy, setBusy] = useState(false)
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set(revealed ? Array.from({ length: 50 }, (_, i) => i) : []))

  const req = useQuery({
    queryKey: ['req', reqId],
    queryFn: () => http<OpenRequest>(`tc/packs/requests/${reqId}`),
    enabled: !!reqId && open,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'pending' ? false : 4000),
  })
  const r = req.data
  const activeSetId = r?.setId ?? setId
  const set = useMemo(() => sets.data?.find((s) => s.id === activeSetId), [sets.data, activeSetId])
  const available = me.data?.unopened?.find((u) => u.setId === activeSetId)?.count ?? 0
  const maxQty = Math.max(1, Math.min(MAX_PACKS_PER_TX, available))

  useEffect(() => { if (qty > maxQty && available > 0) setQty(maxQty) }, [maxQty, available, qty])
  useEffect(() => {
    if (r?.status === 'fulfilled' || r?.status === 'cancelled' || r?.status === 'ready') refresh()
  }, [r?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function breakSeal() {
    if (!activeSetId) return
    setBusy(true)
    try {
      const out = await sendTx<{ tx: string; reqId: string }>(`Open ${qty} pack${qty > 1 ? 's' : ''}`, 'tc/packs/open', { setId: activeSetId, qty })
      setFlipped(new Set())
      setReqId(String(out.reqId))
      refresh()
    } catch { /* toast shown */ } finally { setBusy(false) }
  }
  async function claim() {
    if (!r) return
    setBusy(true)
    try {
      await sendTx(`Claim ${r.count * 5} cards`, 'tc/packs/claim', { reqId: String(r.reqId) })
      setFlipped(new Set())
      await req.refetch()
      refresh()
    } catch { /* toast shown */ } finally { setBusy(false) }
  }
  async function reclaim() {
    if (!r) return
    setBusy(true)
    try { await sendTx('Reclaim packs', 'tc/packs/cancel', { reqId: String(r.reqId) }); await req.refetch() } catch { /* toast shown */ } finally { setBusy(false) }
  }

  const stage: 'choose' | 'loading' | 'pending' | 'ready' | 'fulfilled' | 'cancelled' =
    !reqId ? 'choose' : !r ? 'loading' : (r.status as 'pending' | 'ready' | 'fulfilled' | 'cancelled')
  const rarest = stage === 'fulfilled' && r!.cards.length ? Math.max(...r!.cards.map((c) => c.rarity)) : -1
  const allFlipped = stage === 'fulfilled' && flipped.size >= r!.cards.length

  const title = {
    choose: 'Break the Seal', loading: 'Consulting the Oracle…', pending: 'Fate Is Being Drawn', ready: 'Your Fate Is Sealed',
    fulfilled: allFlipped && rarest >= 3 ? 'A Legendary Pull!' : 'Behold Your Cards', cancelled: 'Request Withdrawn',
  }[stage]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader className="text-center sm:text-center">
          <div className="kicker">{set?.name ?? r?.setName ?? 'Pack opening'}</div>
          <DialogTitle className={stage === 'fulfilled' && allFlipped && rarest >= 3 ? 'gold-shimmer text-3xl' : 'text-2xl'}>{title}</DialogTitle>
          <DialogDescription className="text-fg-subtle">
            {stage === 'choose' && 'Each pack holds 5 cards; the fifth is always Rare or better. Randomness comes from Chainlink VRF.'}
            {stage === 'pending' && 'Chainlink VRF is drawing your cards. This usually takes 1–3 blocks (about 15–45 seconds).'}
            {stage === 'ready' && 'The random number has arrived and your cards are already decided. Claim them to mint them into your wallet.'}
            {stage === 'fulfilled' && 'Click a card to turn it over, or reveal them all at once.'}
            {stage === 'cancelled' && 'Chainlink VRF never answered this request, so the packs were returned to you unopened.'}
            {stage === 'loading' && 'Reading your request from the chain…'}
          </DialogDescription>
        </DialogHeader>
        <Divider />

        {stage === 'choose' && (
          <div className="grid items-center gap-8 md:grid-cols-[220px_1fr]">
            <div className="mx-auto w-44 md:w-full">{set && <PackArt set={set} count={available} className="animate-float" />}</div>
            <div className="space-y-5 text-center md:text-left">
              <p className="text-lg text-ivory">
                {available > 0
                  ? <>You hold <b className="text-gold-bright">{available}</b> sealed pack{available > 1 ? 's' : ''} of <b>{set?.name ?? '…'}</b>.</>
                  : me.isFetching ? 'Counting your packs…' : 'You have no sealed packs of this set.'}
              </p>
              {available > 0 && (
                <>
                  <div className="flex items-center justify-center gap-3 md:justify-start">
                    <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.max(1, x - 1))} aria-label="Fewer packs"><Minus /></Button>
                    <div className="w-20 text-center">
                      <div className="font-display text-4xl font-black text-gold-bright">{qty}</div>
                      <div className="font-display text-[10px] tracking-[0.2em] text-fg-muted">PACK{qty > 1 ? 'S' : ''} · {qty * 5} CARDS</div>
                    </div>
                    <Button variant="outline" size="icon" onClick={() => setQty((x) => Math.min(maxQty, x + 1))} aria-label="More packs"><Plus /></Button>
                  </div>
                  <Button size="lg" className="w-full md:w-auto" disabled={busy} onClick={breakSeal}>
                    <Sparkles /> {busy ? 'Breaking the seal…' : `Open ${qty} pack${qty > 1 ? 's' : ''}`}
                  </Button>
                  <p className="text-xs text-fg-muted">Two signatures: one to request randomness, one to claim your cards once it arrives.</p>
                </>
              )}
            </div>
          </div>
        )}

        {(stage === 'pending' || stage === 'loading') && (
          <div className="py-6 text-center">
            <div className="relative mx-auto flex w-fit gap-2 sm:gap-3">
              <div className="pointer-events-none absolute -inset-10 animate-spin-slow rounded-full border border-dashed border-gold/25" />
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="w-12 animate-float sm:w-16" style={{ animationDelay: `${i * 0.25}s` }}><CardBack className="animate-glow" /></div>
              ))}
            </div>
            {r && (
              <div className="mt-8 font-mono text-[11px] text-fg-muted">
                VRF request {short(String(r.reqId), 8)}
                {txUrl(r.txHash) && <> · <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" className="text-gold hover:underline">open tx ↗</a></>}
              </div>
            )}
            {r && Date.now() - new Date(r.createdAt).getTime() > STUCK_AFTER_MS && (
              <Button variant="outline" size="sm" className="mt-4" disabled={busy} onClick={reclaim}>VRF did not answer — reclaim my packs</Button>
            )}
          </div>
        )}

        {stage === 'ready' && r && (
          <div className="py-4 text-center">
            <div className="mx-auto flex w-fit gap-2 sm:gap-3">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="w-12 sm:w-16"><CardBack className="animate-glow" /></div>)}
            </div>
            <Button size="lg" className="mt-6" disabled={busy} onClick={claim}>
              <Sparkles /> {busy ? 'Minting your cards…' : `Claim ${r.count * 5} cards`}
            </Button>
          </div>
        )}

        {stage === 'fulfilled' && r && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-fg-subtle">
                {r.count} pack{r.count > 1 ? 's' : ''} · {r.cards.length} cards
                {rarest >= 0 && allFlipped && <> · best pull <b style={{ color: RARITY_COLOR[rarest] }}>{RARITY_NAMES[rarest]}</b></>}
              </div>
              {!allFlipped && <Button variant="outline" size="sm" onClick={() => setFlipped(new Set(r.cards.map((_, i) => i)))}>Reveal all</Button>}
            </div>
            {Array.from({ length: r.count }, (_, p) => (
              <div key={p}>
                {r.count > 1 && <div className="mb-2 font-display text-[10px] tracking-[0.25em] text-fg-muted">PACK {p + 1}</div>}
                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {r.cards.slice(p * 5, p * 5 + 5).map((c, i) => {
                    const idx = p * 5 + i
                    return <FlipCard key={idx} card={c} flipped={flipped.has(idx)} delay={flipped.size === r.cards.length ? i * 110 : 0} onFlip={() => setFlipped((s) => new Set(s).add(idx))} />
                  })}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gold/15 pt-4">
              <div className="font-mono text-[11px] text-fg-muted">
                VRF request {short(String(r.reqId), 8)}
                {r.fulfillTx && txUrl(r.fulfillTx) && <> · <a href={txUrl(r.fulfillTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-gold hover:underline">claim tx <ExternalLink className="size-3" /></a></>}
              </div>
              <div className="flex flex-wrap gap-2">
                {available > 0 && <Button variant="outline" size="sm" onClick={() => { setReqId(null); setQty(Math.min(maxQty, qty)); setFlipped(new Set()) }}>Open another ({available} left)</Button>}
                <Button size="sm" onClick={() => { onOpenChange(false); navigate('/profile?tab=collection') }}>View collection</Button>
              </div>
            </div>
          </div>
        )}

        {stage === 'cancelled' && (
          <div className="py-4 text-center">
            <Button variant="outline" onClick={() => setReqId(null)}>Back to my packs</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One dialog per opening session; `openPacks(setId)` starts fresh, `resume(reqId)` picks up a request. */
export function usePackOpener() {
  const refresh = useRefresh()
  const [s, setS] = useState<{ key: number; setId?: number; reqId?: string; qty?: number; revealed?: boolean } | null>(null)
  const dialog = s ? (
    <PackOpenDialog key={s.key} open setId={s.setId} initialReqId={s.reqId} suggestQty={s.qty} revealed={s.revealed} onOpenChange={(o) => { if (!o) { setS(null); refresh() } }} />
  ) : null
  return {
    openPacks: (setId: number, qty?: number) => setS({ key: Date.now(), setId, qty }),
    resume: (reqId: string | number, opts?: { revealed?: boolean }) => setS({ key: Date.now(), reqId: String(reqId), revealed: opts?.revealed }),
    dialog,
  }
}

/** Gacha flow: buy packs, then go straight into the opening dialog. Asks to connect a wallet first if needed. */
export function useBuyAndOpen() {
  const opener = usePackOpener()
  const refresh = useRefresh()
  const [busySet, setBusySet] = useState<number | null>(null)
  async function buy(set: { id: number; name: string }, qty: number) {
    if (!currentAddress()) return connectWallet().catch(() => {})
    setBusySet(set.id)
    try {
      await sendTx(`Buy ${qty} pack${qty > 1 ? 's' : ''} of ${set.name}`, 'tc/packs/buy', { setId: set.id, qty })
      refresh()
      opener.openPacks(set.id, qty)
    } catch { /* toast shown */ } finally { setBusySet(null) }
  }
  return { buy, busySet, openPacks: opener.openPacks, resume: opener.resume, dialog: opener.dialog }
}
