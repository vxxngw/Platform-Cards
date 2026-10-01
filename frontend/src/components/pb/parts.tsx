import { useState } from 'react'
import { Check, Circle, Loader2, X } from 'lucide-react'
import { RARITY_COLOR } from '@/lib/tc'
import { imageUrl } from '@/lib/pokemon/metadata'
import { TIER_NAMES, type Tier } from '@/lib/pokemon/tiers'
import type { CheckItem } from '@/lib/pokemon/validate'
import { STEPS, type StepId, type StepStatus } from '@/lib/pokemon/publish'
import { cn } from '@/lib/utils'

/** Card image (TCGdex low.webp for thumbnails) with a neutral placeholder when it is missing or fails to load. */
export function Thumb({ image, alt, className, quality = 'low' }: { image: string | null | undefined; alt: string; className?: string; quality?: 'low' | 'high' }) {
  const [broken, setBroken] = useState(false)
  const src = imageUrl(image, quality)
  if (!src || broken) {
    return <div className={cn('flex aspect-[5/7] items-center justify-center rounded bg-bg-subtle text-[9px] text-fg-muted', className)}>no image</div>
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn('aspect-[5/7] rounded object-cover', className)} />
}

export function TierSelect({ value, onChange, disabled }: { value: Tier | null; onChange: (t: Tier) => void; disabled?: boolean }) {
  return (
    <select
      className="h-8 rounded-md border border-border bg-background px-1.5 text-xs font-semibold disabled:opacity-50"
      style={{ color: value == null ? undefined : RARITY_COLOR[value], borderColor: value == null ? 'var(--color-destructive, #ef4444)' : undefined }}
      value={value ?? ''}
      disabled={disabled}
      aria-label="On-chain tier"
      onChange={(e) => onChange(Number(e.target.value) as Tier)}
    >
      {value == null && <option value="">— pick a tier —</option>}
      {TIER_NAMES.map((n, t) => <option key={n} value={t}>{n}</option>)}
    </select>
  )
}

export function TierDot({ tier, className }: { tier: Tier | null | undefined; className?: string }) {
  if (tier == null) return <span className={cn('inline-block size-2 rounded-full border border-fg-muted', className)} title="No tier yet" />
  return <span className={cn('inline-block size-2 rounded-full', className)} style={{ background: RARITY_COLOR[tier] }} title={TIER_NAMES[tier]} />
}

export function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((it) => (
        <li key={it.id} className="flex items-start gap-2">
          {it.ok ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <span className={it.ok ? 'text-fg-subtle' : 'text-fg-base'}>
            {it.label}
            {!it.ok && it.hint && <span className="ml-1.5 text-xs text-destructive">— {it.hint}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StepList({ status, detail }: { status: Record<StepId, StepStatus>; detail: Partial<Record<StepId, string>> }) {
  return (
    <ol className="space-y-2">
      {STEPS.map((s, i) => {
        const st = status[s.id]
        return (
          <li key={s.id} className="flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
              {st === 'done' ? <Check className="size-4 text-emerald-400" />
                : st === 'running' ? <Loader2 className="size-4 animate-spin text-primary" />
                : st === 'error' ? <X className="size-4 text-destructive" />
                : <Circle className="size-3.5 text-fg-muted" />}
            </span>
            <div className="min-w-0">
              <div className={cn(st === 'idle' && 'text-fg-muted', st === 'error' && 'text-destructive')}>{i + 1}. {s.label}</div>
              {detail[s.id] && <div className={cn('break-all text-xs', st === 'error' ? 'text-destructive' : 'text-fg-muted')}>{detail[s.id]}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
