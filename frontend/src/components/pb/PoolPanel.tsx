import { useState } from 'react'
import { Plus, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RARITY_COLOR } from '@/lib/tc'
import { DEFAULT_MAX_SUPPLY, POOL_SIZE, type Tier } from '@/lib/pokemon/tiers'
import { tierCounts } from '@/lib/pokemon/validate'
import type { PoolCard } from '@/lib/pokemon/types'
import { TIER_NAMES } from '@/lib/pokemon/tiers'
import { Thumb, TierSelect } from './parts'

export function PoolPanel({ pool, reward, lang, onChangeCard, onRemove, onClearReward, onAddCustom }: {
  pool: PoolCard[]
  reward: PoolCard | null
  lang: string
  onChangeCard: (key: string, patch: Partial<PoolCard>) => void
  onRemove: (key: string) => void
  onClearReward: () => void
  onAddCustom: (card: PoolCard, as: 'pool' | 'reward') => void
}) {
  const counts = tierCounts(pool)
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">2. Thẻ trong pack <span className="font-mono text-sm text-fg-muted">{pool.length}/{POOL_SIZE}</span></div>
        <div className="flex gap-2 text-[11px] text-fg-muted">
          {([0, 1, 2, 3] as Tier[]).map((t) => (
            <span key={t} className="flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: RARITY_COLOR[t] }} />{counts[t]}</span>
          ))}
        </div>
      </div>
      <p className="text-xs text-fg-muted">Bậc on-chain tự gán theo bảng quy đổi độ hiếm, sửa tay được. Thẻ không có trong bảng bắt buộc phải gán tay.</p>

      <div className="divide-y divide-border rounded-lg border border-border">
        {pool.length === 0 && <div className="px-3 py-6 text-center text-sm text-fg-muted">Chưa chọn thẻ nào. Bấm vào một thẻ ở bên trái.</div>}
        {pool.map((c) => (
          <div key={c.key} className="grid grid-cols-[34px_1fr_auto] items-center gap-2 px-2 py-1.5">
            <Thumb image={c.image} alt={c.name} className="w-[34px]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{c.name} <span className="font-mono text-[11px] text-fg-muted">#{c.localId}</span></div>
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                <span>{c.officialRarity ?? 'Không có độ hiếm'}</span>
                {c.tierSource === 'inferred' && <span className="rounded bg-amber-500/15 px-1 text-amber-300" title="Bậc suy ra ngoài bảng quy đổi của spec">gợi ý</span>}
                {c.custom && <span className="rounded bg-bg-subtle px-1">nhập tay</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <TierSelect value={c.tier} onChange={(t) => onChangeCard(c.key, { tier: t, tierSource: 'manual', maxSupply: DEFAULT_MAX_SUPPLY[t] })} />
              <Input className="h-8 w-[78px] px-1.5 text-right font-mono text-xs" type="number" min={1} step={1} value={c.maxSupply} aria-label="maxSupply"
                onChange={(e) => onChangeCard(c.key, { maxSupply: Math.floor(Number(e.target.value)) })} />
              <button className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-destructive" onClick={() => onRemove(c.key)} aria-label="Bỏ thẻ"><X className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Star className="size-4 text-amber-400" />Thẻ thưởng <span className="text-xs font-normal text-fg-muted">(không nằm trong pool rút, chỉ nhận khi đổi trọn bộ)</span></div>
        {reward ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-2 py-1.5">
            <Thumb image={reward.image} alt={reward.name} className="w-[34px]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{reward.name} <span className="font-mono text-[11px] text-fg-muted">#{reward.localId}</span></div>
              <div className="text-[11px] text-fg-muted">{reward.officialRarity ?? 'Không có độ hiếm'} · {reward.setName}</div>
            </div>
            <button className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-destructive" onClick={onClearReward} aria-label="Bỏ thẻ thưởng"><X className="size-4" /></button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-muted">Chuyển nút “Thẻ thưởng” ở bên trái rồi bấm một thẻ (cùng set Pokémon, không trùng thẻ trong pool).</div>
        )}
      </div>

      <CustomCardForm lang={lang} nextNumber={String(pool.length + 1)} onAdd={onAddCustom} />
    </div>
  )
}

function CustomCardForm({ lang, nextNumber, onAdd }: { lang: string; nextNumber: string; onAdd: (c: PoolCard, as: 'pool' | 'reward') => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', localId: '', setName: '', image: '', rarity: '', tier: 0 as Tier, as: 'pool' as 'pool' | 'reward' })
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus />Thêm thẻ nhập tay (phương án dự phòng)</Button>
  const valid = f.name.trim().length > 0
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="text-sm font-semibold">Thẻ nhập tay</div>
      <p className="text-[11px] text-fg-muted">Dùng khi TCGdex lỗi hoặc muốn thẻ tự thiết kế (như spec v1). Không có giá tham chiếu.</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-8" placeholder="Tên thẻ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input className="h-8" placeholder={`Số thẻ (${nextNumber})`} value={f.localId} onChange={(e) => setF({ ...f, localId: e.target.value })} />
        <Input className="h-8" placeholder="Tên set" value={f.setName} onChange={(e) => setF({ ...f, setName: e.target.value })} />
        <Input className="h-8" placeholder="Độ hiếm chính thức (tuỳ chọn)" value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })} />
        <Input className="col-span-2 h-8" placeholder="URL ảnh https://… (tuỳ chọn)" value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
        <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={f.tier} onChange={(e) => setF({ ...f, tier: Number(e.target.value) as Tier })} aria-label="Bậc">
          {TIER_NAMES.map((n, t) => <option key={n} value={t}>{n}</option>)}
        </select>
        <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={f.as} onChange={(e) => setF({ ...f, as: e.target.value as 'pool' | 'reward' })} aria-label="Thêm vào">
          <option value="pool">Vào pool</option>
          <option value="reward">Làm thẻ thưởng</option>
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
        }}>Thêm</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
      </div>
    </div>
  )
}
