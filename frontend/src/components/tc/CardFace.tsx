import { useMemo, useState } from 'react'
import { cardImageSrc } from '@/lib/pokemon/metadata'
import { RARITY_COLOR, RARITY_NAMES, type Card } from '@/lib/tc'
import { cn } from '@/lib/utils'

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

export function CardFace({ card, className, count, dim, onClick, quality = 'low' }: {
  card: Card; className?: string; count?: number; dim?: boolean; onClick?: () => void; quality?: 'low' | 'high'
}) {
  const color = RARITY_COLOR[card.rarity]
  const glow = card.rarity >= 2
  // v2 cards carry the TCGdex image; v1/demo cards (or a broken link) fall back to the generated art
  const [broken, setBroken] = useState(false)
  const src = !broken ? cardImageSrc(card.image, quality) : null
  return (
    <div
      onClick={onClick}
      title={src ? `${card.name}${card.localId ? ` · #${card.localId}` : ''}${card.officialRarity ? ` · ${card.officialRarity}` : ''}` : undefined}
      className={cn('relative aspect-[5/7] w-full select-none overflow-hidden rounded-xl border-2 bg-black transition', onClick && 'cursor-pointer hover:-translate-y-0.5', dim && 'opacity-35 grayscale', className)}
      style={{ borderColor: color, boxShadow: glow && !dim ? `0 0 18px -4px ${color}` : undefined }}
    >
      {src ? (
        <img src={src} alt={card.name} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0"><CardArt card={card} /></div>
      )}
      {card.rarity >= 3 && !dim && (
        <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.7) 45%, transparent 60%)' }} />
      )}
      <div className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/80">#{card.id}</div>
      {count != null && count > 0 && (
        <div className="absolute right-1.5 top-1.5 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-black">×{count}</div>
      )}
      {src ? (
        // the card art already prints its name: keep only a slim tier strip so the artwork stays readable
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-black/10 px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
          <span>{RARITY_NAMES[card.rarity]}</span>
          <span className="font-mono text-white/60">{card.isReward ? 'REWARD' : card.localId ?? card.cardNo}</span>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-2 pb-2 pt-6">
          <div className="truncate text-[13px] font-bold leading-tight text-white">{card.name}</div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
            <span>{RARITY_NAMES[card.rarity]}</span>
            <span className="font-mono text-white/50">{card.isReward ? 'REWARD' : `${card.cardNo}`}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-[5/7] w-full overflow-hidden rounded-xl border-2 border-white/15 bg-[#141414]', className)}>
      <div className="absolute inset-3 rounded-lg border border-white/10" style={{ background: 'repeating-linear-gradient(45deg, rgba(255,40,130,.10) 0 6px, transparent 6px 14px)' }} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rotate-[-8deg] rounded-md border border-white/20 bg-black/70 px-3 py-1 font-mono text-xs tracking-[0.3em] text-white/70">ERC-1155</div>
      </div>
    </div>
  )
}

export function RarityBadge({ rarity }: { rarity: number }) {
  const c = RARITY_COLOR[rarity]
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: c, background: `${c}1f` }}>
      {RARITY_NAMES[rarity]}
    </span>
  )
}
