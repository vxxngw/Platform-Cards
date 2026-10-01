import { useId, type ReactNode } from 'react'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** The house crest: a crowned shield bearing two crossed cards. */
export function Crest({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 72" className={className} role="img" aria-label={title ?? BRAND}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1c4" />
          <stop offset=".45" stopColor="#d6ab52" />
          <stop offset="1" stopColor="#8f6a22" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d2678" />
          <stop offset="1" stopColor="#150d28" />
        </linearGradient>
      </defs>
      <path d="M17 15 L21 4 L26.5 11 L32 1.5 L37.5 11 L43 4 L47 15 Z" fill={`url(#${id}g)`} />
      <circle cx="21" cy="4" r="1.8" fill="#f6dc95" />
      <circle cx="32" cy="1.8" r="1.8" fill="#f6dc95" />
      <circle cx="43" cy="4" r="1.8" fill="#f6dc95" />
      <rect x="17" y="15" width="30" height="4.5" rx="1" fill={`url(#${id}g)`} />
      <path d="M7 22 H57 V41 C57 56 45 65 32 71 C19 65 7 56 7 41 Z" fill={`url(#${id}f)`} stroke={`url(#${id}g)`} strokeWidth="2.5" />
      <path d="M12 26 H52 V41 C52 53 42 60.5 32 65.5 C22 60.5 12 53 12 41 Z" fill="none" stroke="#d6ab52" strokeOpacity=".35" strokeWidth="1" />
      <g transform="rotate(-15 28 42)">
        <rect x="20" y="31" width="15" height="21" rx="2" fill="#efe3c6" stroke="#8f6a22" strokeWidth="1" />
      </g>
      <g transform="rotate(13 36 42)">
        <rect x="29" y="31" width="15" height="21" rx="2" fill="#f6dc95" stroke="#8f6a22" strokeWidth="1" />
        <path d="M36.5 36 L40 41.5 L36.5 47 L33 41.5 Z" fill="#8e1b2e" />
      </g>
    </svg>
  )
}

/** Filigree corner; Frame rotates one into each corner. */
function Corner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 38 V11 Q2 2 11 2 H38" />
      <path d="M7 38 V15 Q7 7 15 7 H38" strokeOpacity=".5" />
      <path d="M2 20 Q13 20 13 9 Q13 2 20 2" strokeOpacity=".75" />
      <circle cx="4.5" cy="4.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M24 2 L27 4.5 L30 2" strokeOpacity=".8" />
      <path d="M2 24 L4.5 27 L2 30" strokeOpacity=".8" />
    </svg>
  )
}

/** A royal panel with gold filigree in the four corners. */
export function Frame({ children, className, strong, corners = true }: { children: ReactNode; className?: string; strong?: boolean; corners?: boolean }) {
  return (
    <div className={cn('royal-panel', strong && 'royal-panel-strong', className)}>
      {corners && (
        <>
          <Corner className="pointer-events-none absolute left-1 top-1 size-7 text-gold/70" />
          <Corner className="pointer-events-none absolute right-1 top-1 size-7 -scale-x-100 text-gold/70" />
          <Corner className="pointer-events-none absolute bottom-1 left-1 size-7 -scale-y-100 text-gold/70" />
          <Corner className="pointer-events-none absolute bottom-1 right-1 size-7 rotate-180 text-gold/70" />
        </>
      )}
      {children}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-gold/80', className)} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/40 to-gold/70" />
      <svg viewBox="0 0 48 12" className="h-3 w-12" fill="currentColor">
        <path d="M24 0 L28.5 6 L24 12 L19.5 6 Z" />
        <circle cx="10" cy="6" r="1.7" />
        <circle cx="38" cy="6" r="1.7" />
        <path d="M13 6 H18 M30 6 H35" stroke="currentColor" strokeWidth="1" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/40 to-gold/70" />
    </div>
  )
}

export function SectionHeader({ kicker, title, sub, action, className }: {
  kicker?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {kicker && <div className="kicker mb-1">{kicker}</div>}
        <h2 className="text-2xl font-bold text-ivory md:text-[28px]">{title}</h2>
        {sub && <p className="mt-1 max-w-2xl text-fg-subtle">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** Page banner: kicker, gold title, subtitle, crest watermark, optional content on the right. */
export function PageHero({ kicker, title, sub, children }: { kicker: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <Frame strong className="overflow-hidden px-6 py-8 md:px-10 md:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(75,47,143,.45),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(142,27,46,.25),transparent_60%)]" />
      <Crest className="pointer-events-none absolute -right-6 -top-4 h-56 w-56 opacity-[0.07]" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="kicker mb-2">{kicker}</div>
          <h1 className="gold-text text-3xl font-black leading-tight md:text-5xl">{title}</h1>
          {sub && <p className="mt-3 text-[17px] leading-relaxed text-fg-subtle">{sub}</p>}
        </div>
        {children}
      </div>
    </Frame>
  )
}

export function Stat({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-fg-muted">{label}</div>
      <div className="mt-1 truncate font-display text-2xl font-bold text-gold-bright">{value ?? '…'}</div>
    </div>
  )
}

export function EmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Frame className={cn('px-6 py-12 text-center', className)}>
      <Crest className="mx-auto h-16 w-16 opacity-40" />
      <div className="mt-4 font-display text-lg font-bold text-ivory">{title}</div>
      {body && <p className="mx-auto mt-1 max-w-md text-fg-subtle">{body}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </Frame>
  )
}
