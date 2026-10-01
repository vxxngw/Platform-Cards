import { useMemo, useState } from 'react'
import { cardImageSrc } from '@/lib/pokemon/metadata'
import { RARITY_COLOR, RARITY_NAMES, type Card } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/royal/Ornaments'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function poly(cx: number, cy: number, r: number, n: number, rot: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i * Math.PI * 2) / n
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

export function CardArt({ card }: { card: Pick<Card, 'id' | 'hue' | 'rarity'> }) {
  const art = useMemo(() => {
    const r = rng(card.id * 9973 + card.hue)
    const sides = 3 + Math.floor(r() * 6)
    const rings = 3 + card.rarity
    const dots = Array.from({ length: 14 + card.rarity * 6 }, () => ({ x: r() * 100, y: r() * 100, s: 0.4 + r() * 1.6, o: 0.15 + r() * 0.5 }))
    const rot = r() * Math.PI
    const arcs = Array.from({ length: 3 }, () => ({ r: 18 + r() * 26, w: 0.6 + r() * 1.4, d: 4 + r() * 10 }))
    return { sides, rings, dots, rot, arcs }
  }, [card.id, card.hue, card.rarity])
  const h = card.hue
  const gid = `g${card.id}`
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={gid} cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor={`hsl(${h} 70% 42%)`} />
          <stop offset="55%" stopColor={`hsl(${(h + 30) % 360} 55% 16%)`} />
          <stop offset="100%" stopColor={`hsl(${(h + 60) % 360} 40% 6%)`} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gid})`} />
      {art.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.s} fill={`hsl(${h} 90% 80%)`} opacity={d.o} />)}
      {art.arcs.map((a, i) => (
        <circle key={`a${i}`} cx="50" cy="44" r={a.r} fill="none" stroke={`hsl(${(h + 20) % 360} 90% 70%)`} strokeWidth={a.w} strokeDasharray={`${a.d} ${a.d / 2}`} opacity="0.35" />
      ))}
      {Array.from({ length: art.rings }, (_, i) => (
        <polygon key={`p${i}`} points={poly(50, 44, 30 - i * 6, art.sides, art.rot + i * 0.35)} fill={i === art.rings - 1 ? `hsl(${h} 95% 70%)` : 'none'}
          fillOpacity={0.85} stroke={`hsl(${(h + i * 15) % 360} 95% ${70 - i * 4}%)`} strokeWidth={1.2} opacity={0.9 - i * 0.08} />
      ))}
    </svg>
  )
}

/** `compact` keeps only the frame and the rarity gem, for thumbnails too small to carry text. */
export function CardFace({ card, className, count, dim, onClick, quality = 'low', compact }: {
  card: Card; className?: string; count?: number; dim?: boolean; onClick?: () => void; quality?: 'low' | 'high'; compact?: boolean
}) {
  const color = RARITY_COLOR[card.rarity]
  const glow = card.rarity >= 2
  // Pokémon cards carry the TCGdex image; hand-made cards (or a broken link) fall back to the generated art
  const [broken, setBroken] = useState(false)
  const src = !broken ? cardImageSrc(card.image, quality) : null
  return (
    <div
      onClick={onClick}
      title={`${card.name}${card.localId ? ` · #${card.localId}` : ''}${card.officialRarity ? ` · ${card.officialRarity}` : ''}`}
      className={cn(
        'group/card relative aspect-[5/7] w-full select-none overflow-hidden rounded-[10px] border-2 bg-night p-[3px] transition duration-300',
        onClick && 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_14px_30px_-12px_rgba(0,0,0,.9)]',
        dim && 'opacity-30 grayscale',
        className,
      )}
      style={{ borderColor: color, boxShadow: glow && !dim ? `0 0 22px -6px ${color}` : undefined }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[7px] ring-1 ring-gold/40">
        {src ? (
          <img src={src} alt={card.name} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0"><CardArt card={card} /></div>
        )}
        {card.rarity >= 3 && !dim && <div className="foil pointer-events-none absolute inset-0 opacity-60" />}
        {!compact && <div className="absolute left-1 top-1 rounded-sm bg-night/75 px-1 py-px font-mono text-[9px] text-ivory/80 ring-1 ring-gold/30">#{card.id}</div>}
        {count != null && count > 0 && (
          <div className="absolute right-1 top-1 rounded-sm bg-[linear-gradient(180deg,#f6dc95,#d6ab52)] px-1.5 py-px font-display text-[10px] font-bold text-primary-foreground shadow">×{count}</div>
        )}
        {card.isReward && !compact && (
          <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-md bg-[linear-gradient(180deg,#c73b45,#8e1b2e)] px-2 pb-0.5 font-display text-[8px] font-bold tracking-[0.2em] text-ivory shadow">REWARD</div>
        )}
        {compact ? (
          <span className="absolute bottom-1 left-1 size-2 rotate-45 ring-1 ring-night" style={{ background: color }} />
        ) : (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night via-night/85 to-transparent px-1.5 pb-1 pt-4">
          {!src && <div className="truncate font-display text-[12px] font-bold leading-tight text-ivory">{card.name}</div>}
          <div className="flex items-center justify-between gap-1 font-display text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
            <span className="flex items-center gap-1"><span className="size-1.5 rotate-45" style={{ background: color }} />{RARITY_NAMES[card.rarity]}</span>
            <span className="font-mono text-[9px] normal-case tracking-normal text-ivory/55">{card.isReward ? '' : card.localId ?? card.cardNo}</span>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

/** The back of every card: violet velvet, gold lattice and the house crest. */
export function CardBack({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-[5/7] w-full overflow-hidden rounded-[10px] border-2 border-gold/70 bg-[radial-gradient(circle_at_50%_40%,#3d2678_0%,#1a1030_55%,#0d0a16_100%)] p-[3px] shadow-[0_10px_24px_-14px_rgba(0,0,0,.9)]', className)}>
      <div className="relative h-full w-full rounded-[7px] ring-1 ring-gold/40" style={{ background: 'repeating-linear-gradient(45deg, rgba(214,171,82,.09) 0 1px, transparent 1px 10px), repeating-linear-gradient(-45deg, rgba(214,171,82,.09) 0 1px, transparent 1px 10px)' }}>
        <div className="absolute inset-[10%] rounded-[50%/38%] border border-gold/35" />
        <div className="absolute inset-0 flex items-center justify-center">
          <BrandMark className="h-[42%] w-[42%] drop-shadow-[0_0_10px_rgba(214,171,82,.45)]" />
        </div>
      </div>
    </div>
  )
}

export function RarityBadge({ rarity }: { rarity: number }) {
  const c = RARITY_COLOR[rarity]
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
      <span className="size-1.5 rotate-45" style={{ background: c }} />
      {RARITY_NAMES[rarity]}
    </span>
  )
}
