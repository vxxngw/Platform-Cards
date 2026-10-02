import { useState } from 'react'
import { ImagePlus, Loader2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { sendTx, type Card } from '@/lib/tc'
import { useRefresh, useSets } from '@/lib/hooks'
import { signMessage } from '@/lib/chain/adapter'
import { buildImageRepairFolder } from '@/lib/pokemon/metadata'
import { pinMetadata, type PinStatus } from '@/lib/pokemon/pin'
import { loadContext } from '@/lib/pokemon/publish'
import { suggestPrinting } from '@/lib/pokemon/tcgdex'
import { ImagePicker } from './ImagePicker'
import { Thumb } from './parts'
import type { WalletInfo } from './PublishPanel'

type Fix = { image: string; from: string }
const setOf = (c: Card) => c.tcgdexId?.replace(/-[^-]+$/, '') || undefined

function Row({ card, fix, onFix }: { card: Card; fix?: Fix; onFix: (f: Fix) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <button className="group relative w-[34px] shrink-0" onClick={() => setOpen(true)} title="Pick an image">
        <Thumb image={fix?.image ?? null} alt={card.name} className="w-[34px]" />
        <span className={`absolute inset-0 flex items-center justify-center rounded bg-night/60 text-gold transition ${fix ? 'opacity-0 group-hover:opacity-100' : ''}`}><ImagePlus className="size-4" /></span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{card.name} <span className="font-mono text-[11px] text-fg-muted">token #{card.id}</span></div>
        <div className="text-[11px] text-fg-muted">{card.setName ?? `set #${card.setId}`}{card.localId ? ` · #${card.localId}` : ''}{fix ? ` · art: ${fix.from}` : ' · no image'}</div>
      </div>
      <ImagePicker open={open} onOpenChange={setOpen} lang={card.lang || 'en'} name={card.name} excludeSetId={setOf(card)} onPick={(image, from) => onFix({ image, from })} />
    </div>
  )
}

/**
 * Adds pictures to cards that were published without one (their TCGdex set had no images yet). The token ids stay the
 * same: it pins a copy of the metadata folder with the new images and points the collection's base URI at it.
 */
export function RepairPanel({ wallet, pin }: { wallet: WalletInfo; pin: PinStatus | null | undefined }) {
  const sets = useSets()
  const refresh = useRefresh()
  const [fixes, setFixes] = useState<Record<number, Fix>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const cards = (sets.data ?? []).flatMap((s) => s.cards).filter((c) => !c.image)
  if (!cards.length) return null
  const ready = wallet.isAdmin && wallet.rightNetwork && pin?.mode === 'pinata' && pin.authConfigured
  const count = Object.keys(fixes).length

  async function findAll() {
    setBusy('find')
    let found = 0
    try {
      const next = { ...fixes }
      for (const c of cards) {
        if (next[c.id]) continue
        const hit = await suggestPrinting(c.lang || 'en', c.name, setOf(c)).catch(() => null)
        if (hit?.image) { next[c.id] = { image: hit.image, from: hit.id }; found++ }
      }
      setFixes(next)
      if (found) toast.success(`Found images for ${found} card(s)`, { description: 'Borrowed from earlier printings — check each picture, then save.' })
      else toast.error('No other printing with an image was found', { description: 'Click a thumbnail to search by another name or paste an image URL.' })
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!wallet.address) return
    let stage: 'pin' | 'tx' = 'pin'
    try {
      setBusy('pin')
      const ctx = await loadContext()
      const files = buildImageRepairFolder({ nextCardId: ctx.nextCardId, existing: ctx.existing, images: fixes })
      const out = await pinMetadata(files, wallet.address, (m) => signMessage(wallet.address!, m))
      stage = 'tx'
      setBusy('tx')
      await sendTx('setBaseURI (card images)', 'tc/admin/baseuri', { uri: out.baseUri })
      toast.success(`Images saved for ${count} card(s)`, { description: 'Wallets and the app read the new metadata from now on.' })
      setFixes({})
      refresh()
    } catch (e) {
      // sendTx already toasted wallet errors; show the others
      if (stage === 'pin') toast.error('Could not save the images', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gold/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">Published cards without an image <span className="font-mono text-sm text-fg-muted">{cards.length}</span></div>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={findAll}>{busy === 'find' ? <Loader2 className="animate-spin" /> : <Wand2 />}Find images</Button>
      </div>
      <p className="text-xs text-fg-muted">
        These cards were published while TCGdex had no picture for them. Pick an image per card (usually the earlier printing whose artwork the reprint uses),
        then save: you sign one message to pin the updated metadata and send one setBaseURI transaction. Token ids, supplies and owners do not change.
      </p>
      <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {cards.map((c) => <Row key={c.id} card={c} fix={fixes[c.id]} onFix={(f) => setFixes((p) => ({ ...p, [c.id]: f }))} />)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">{!ready ? 'Needs an admin wallet on Sepolia and /api/pin ready.' : `${count} of ${cards.length} card(s) have a new image.`}</span>
        <Button disabled={!ready || !count || !!busy} onClick={save}>
          {busy === 'pin' || busy === 'tx' ? <Loader2 className="animate-spin" /> : null}
          {busy === 'pin' ? 'Pinning…' : busy === 'tx' ? 'Confirm in your wallet…' : `Save ${count || ''} image(s)`}
        </Button>
      </div>
    </div>
  )
}
