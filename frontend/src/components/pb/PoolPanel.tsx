import { useState } from 'react'
import { ImagePlus, Loader2, Plus, Star, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RARITY_COLOR } from '@/lib/tc'
import { DEFAULT_MAX_SUPPLY, POOL_SIZE, type Tier } from '@/lib/pokemon/tiers'
import { tierCounts } from '@/lib/pokemon/validate'
import type { PoolCard } from '@/lib/pokemon/types'
import { TIER_NAMES } from '@/lib/pokemon/tiers'
import { suggestPrinting } from '@/lib/pokemon/tcgdex'
import { ImagePicker } from './ImagePicker'
import { Thumb, TierSelect } from './parts'

/** Thumbnail that opens the image picker; cards without a picture get a gold hint. */
function ImageButton({ card, onPick }: { card: PoolCard; onPick: (image: string, from: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="group relative w-[34px] shrink-0" onClick={() => setOpen(true)} title={card.image ? 'Change image' : 'No image on TCGdex — pick one'}>
        <Thumb image={card.image} alt={card.name} className="w-[34px]" />
        <span className={`absolute inset-0 flex items-center justify-center rounded bg-night/60 text-gold transition ${card.image ? 'opacity-0 group-hover:opacity-100' : ''}`}>
          <ImagePlus className="size-4" />
        </span>
      </button>
      <ImagePicker open={open} onOpenChange={setOpen} lang={card.lang || 'en'} name={card.name} excludeSetId={card.setId || undefined} onPick={onPick} />
    </>
  )
}

export function PoolPanel({ pool, reward, lang, onChangeCard, onChangeReward, onRemove, onClearReward, onAddCustom }: {
  pool: PoolCard[]
  reward: PoolCard | null
  lang: string
  onChangeCard: (key: string, patch: Partial<PoolCard>) => void
  onChangeReward: (patch: Partial<PoolCard>) => void
  onRemove: (key: string) => void
  onClearReward: () => void
  onAddCustom: (card: PoolCard, as: 'pool' | 'reward') => void
}) {
  const counts = tierCounts(pool)
  const noImage = [...pool, ...(reward ? [reward] : [])].filter((c) => !c.image && !c.custom)
  const [filling, setFilling] = useState(false)

  // Reprint sets often have no pictures on TCGdex yet: borrow the first other printing with the same name.
  async function fillMissing() {
    setFilling(true)
    let found = 0
    try {
      for (const c of noImage) {
        const hit = await suggestPrinting(c.lang || lang, c.name, c.setId || undefined).catch(() => null)
        if (!hit?.image) continue
        found++
        const patch = { image: hit.image, imageFrom: hit.id }
        if (reward && c.key === reward.key) onChangeReward(patch)
        else onChangeCard(c.key, patch)
      }
      const left = noImage.length - found
      if (found) toast.success(`Found images for ${found} card(s)`, { description: `Borrowed from earlier printings — check each picture.${left ? ` ${left} still need one: click its thumbnail.` : ''}` })
      else toast.error('No other printing with an image was found', { description: 'Click a thumbnail to search by another name or paste an image URL.' })
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">2. Cards in the pack <span className="font-mono text-sm text-fg-muted">{pool.length}/{POOL_SIZE}</span></div>
        <div className="flex gap-2 text-[11px] text-fg-muted">
          {([0, 1, 2, 3] as Tier[]).map((t) => (
            <span key={t} className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: RARITY_COLOR[t] }} />{counts[t]}</span>
          ))}
        </div>
      </div>
      <p className="text-xs text-fg-muted">On-chain tiers are filled in from the rarity mapping table and can be changed. Cards whose rarity is not in the table must be assigned by hand. Click a thumbnail to change a card's image.</p>
      {noImage.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-fg-subtle">
          <span>{noImage.length} card(s) have no image on TCGdex (common for sets not released yet). Their artwork usually exists on an earlier printing.</span>
          <Button size="sm" variant="outline" disabled={filling} onClick={fillMissing}>{filling ? <Loader2 className="animate-spin" /> : <Wand2 />}Find images</Button>
        </div>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {pool.length === 0 && <div className="px-3 py-6 text-center text-sm text-fg-muted">No card picked yet. Click a card on the left.</div>}
        {pool.map((c) => (
          <div key={c.key} className="grid grid-cols-[34px_1fr_auto] items-center gap-2 px-2 py-1.5">
            <ImageButton card={c} onPick={(image, from) => onChangeCard(c.key, { image, imageFrom: from })} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{c.name} <span className="font-mono text-[11px] text-fg-muted">#{c.localId}</span></div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                <span>{c.officialRarity ?? 'No rarity'}</span>
                {c.imageFrom && <span className="rounded bg-gold/15 px-1 text-gold" title="Image borrowed from another printing">art: {c.imageFrom}</span>}
                {c.tierSource === 'inferred' && <span className="rounded bg-amber-500/15 px-1 text-amber-300" title="Tier inferred outside the spec's mapping table">suggested</span>}
                {c.custom && <span className="rounded bg-bg-subtle px-1">manual</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <TierSelect value={c.tier} onChange={(t) => onChangeCard(c.key, { tier: t, tierSource: 'manual', maxSupply: DEFAULT_MAX_SUPPLY[t] })} />
              <Input className="h-8 w-[78px] px-1.5 text-right font-mono text-xs" type="number" min={1} step={1} value={c.maxSupply} aria-label="maxSupply"
                onChange={(e) => onChangeCard(c.key, { maxSupply: Math.floor(Number(e.target.value)) })} />
              <button className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-destructive" onClick={() => onRemove(c.key)} aria-label="Remove card"><X className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Star className="size-4 text-amber-400" />Reward card <span className="text-xs font-normal text-fg-muted">(not in the draw pool; earned only by redeeming a full set)</span></div>
        {reward ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-2 py-1.5">
            <ImageButton card={reward} onPick={(image, from) => onChangeReward({ image, imageFrom: from })} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{reward.name} <span className="font-mono text-[11px] text-fg-muted">#{reward.localId}</span></div>
              <div className="text-[11px] text-fg-muted">{reward.officialRarity ?? 'No rarity'} · {reward.setName}{reward.imageFrom ? ` · art: ${reward.imageFrom}` : ''}</div>
            </div>
            <button className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-destructive" onClick={onClearReward} aria-label="Remove reward card"><X className="size-4" /></button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-muted">Switch the picker on the left to “Reward card”, then click a card (same Pokémon set, not already in the pool).</div>
        )}
      </div>

      <CustomCardForm lang={lang} nextNumber={String(pool.length + 1)} onAdd={onAddCustom} />
    </div>
  )
}

function CustomCardForm({ lang, nextNumber, onAdd }: { lang: string; nextNumber: string; onAdd: (c: PoolCard, as: 'pool' | 'reward') => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', localId: '', setName: '', image: '', rarity: '', tier: 0 as Tier, as: 'pool' as 'pool' | 'reward' })
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus />Add a card by hand (fallback)</Button>
  const valid = f.name.trim().length > 0
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-sm font-semibold">Hand-entered card</div>
      <p className="text-[11px] text-fg-muted">Use when TCGdex is down or for your own card designs (as in spec v1). No reference price.</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-8" placeholder="Card name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input className="h-8" placeholder={`Card number (${nextNumber})`} value={f.localId} onChange={(e) => setF({ ...f, localId: e.target.value })} />
        <Input className="h-8" placeholder="Set name" value={f.setName} onChange={(e) => setF({ ...f, setName: e.target.value })} />
        <Input className="h-8" placeholder="Official rarity (optional)" value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} />
        <Input className="col-span-2 h-8" placeholder="Image URL https://… (optional)" value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
        <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={f.tier} onChange={(e) => setF({ ...f, tier: Number(e.target.value) as Tier })} aria-label="Tier">
          {TIER_NAMES.map((n, t) => <option key={n} value={t}>{n}</option>)}
        </select>
        <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={f.as} onChange={(e) => setF({ ...f, as: e.target.value as 'pool' | 'reward' })} aria-label="Add to">
          <option value="pool">To the pool</option>
          <option value="reward">As the reward card</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!valid} onClick={() => {
          onAdd({
            key: `custom:${Date.now()}`, tcgdexId: '', lang, setId: '', setName: f.setName.trim() || 'Custom', localId: f.localId.trim() || nextNumber,
            name: f.name.trim(), image: /^https?:\/\//.test(f.image.trim()) ? f.image.trim() : null, officialRarity: f.rarity.trim() || null,
            tier: f.tier, tierSource: 'manual', maxSupply: DEFAULT_MAX_SUPPLY[f.tier], custom: true, variation: '',
          }, f.as)
          setF({ ...f, name: '', localId: '', image: '', rarity: '' })
        }}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
      </div>
    </div>
  )
}
