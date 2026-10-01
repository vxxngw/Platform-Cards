import { useMemo, useState } from 'react'
import { cardImageSrc } from '@/lib/pokemon/metadata'
import type { Card } from '@/lib/tc'
import { cn } from '@/lib/utils'
import { CardArt } from '@/components/tc/CardFace'

type PackSet = { id: number; name: string; cards: Card[] }

/** The pack's showcase card: the rarest non-reward card that has art. */
export function showcaseCard(cards: Card[]): Card | undefined {
  return [...cards].filter((c) => !c.isReward).sort((a, b) => b.rarity - a.rarity || a.id - b.id)[0]
}

/**
 * A sealed booster: foil wrapper tinted per set, gold-framed arch window showing the set's rarest card,
 * the set name engraved below and a wax seal. Purely decorative (the pack itself is a counter on PackSale).
 */
export function PackArt({ set, className, count, opening }: { set: PackSet; className?: string; count?: number; opening?: boolean }) {
  const hero = useMemo(() => showcaseCard(set.cards), [set.cards])
  const [broken, setBroken] = useState(false)
  const src = hero && !broken ? cardImageSrc(hero.image, 'low') : null
  const hue = (set.id * 67 + 260) % 360
  return (
    <div
      className={cn('relative aspect-[5/7.4] w-full select-none rounded-xl p-[3px] transition duration-500', opening && 'animate-glow', className)}
      // sizes below are in cqw (percent of the pack's width) so the art scales from a 9rem thumbnail to a hero
      style={{ background: 'linear-gradient(160deg,#f6dc95,#8f6a22 40%,#d6ab52 60%,#6b4e16)', containerType: 'inline-size' }}
    >
      <div
        className="relative flex h-full w-full flex-col items-center overflow-hidden rounded-[10px]"
        style={{ background: `linear-gradient(165deg, hsl(${hue} 55% 26%) 0%, #1a1030 45%, hsl(${(hue + 40) % 360} 60% 16%) 100%)` }}
      >
        {/* crimp at the top of the wrapper */}
        <div className="h-3 w-full" style={{ background: 'repeating-linear-gradient(90deg, rgba(246,220,149,.55) 0 4px, transparent 4px 8px)' }} />
        <div className="mt-[6%] font-display font-bold tracking-[0.35em] text-gold-bright/90" style={{ fontSize: '5cqw' }}>BOOSTER</div>
        <div className="relative mt-[5%] aspect-[5/7] w-[62%] overflow-hidden rounded-t-[999px] rounded-b-md border-2 border-gold/80 bg-night shadow-[0_0_24px_-4px_rgba(214,171,82,.6)]">
          {src ? (
            <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
          ) : hero ? (
            <div className="absolute inset-0"><CardArt card={hero} /></div>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-night/70 via-transparent to-transparent" />
        </div>
        <div className="mt-[5%] w-full truncate px-[6%] text-center font-display font-bold leading-tight text-ivory drop-shadow" style={{ fontSize: '8cqw' }}>{set.name}</div>
        <div className="mt-auto mb-[6%] flex aspect-square w-[18%] items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#d4515b,#8e1b2e_60%,#4d0c17)] font-display font-black text-gold-bright shadow-[inset_0_-2px_4px_rgba(0,0,0,.5),0_2px_6px_rgba(0,0,0,.6)] ring-2 ring-[#5e1220]" style={{ fontSize: '7cqw' }}>
          5
        </div>
        <div className="foil pointer-events-none absolute inset-0 opacity-50" />
      </div>
      {count != null && count > 0 && (
        <div className="absolute -right-2 -top-2 flex min-w-7 items-center justify-center rounded-full border border-gold-deep bg-[linear-gradient(180deg,#f6dc95,#d6ab52)] px-1.5 py-0.5 font-display text-xs font-black text-primary-foreground shadow-lg">
          ×{count}
        </div>
      )}
    </div>
  )
}
