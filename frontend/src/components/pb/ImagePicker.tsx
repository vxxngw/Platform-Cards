import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { findPrintings } from '@/lib/pokemon/tcgdex'
import { Thumb } from './parts'

/**
 * Lets the admin borrow a picture for a card that has none on TCGdex: other printings of the same name (reprints reuse
 * the original artwork), a looser name search, or a pasted image URL.
 */
export function ImagePicker({ open, onOpenChange, lang, name, excludeSetId, onPick }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lang: string
  name: string
  /** The card's own set: its printings have no image, so they are hidden. */
  excludeSetId?: string
  onPick: (image: string, from: string) => void
}) {
  const [text, setText] = useState(name)
  const [term, setTerm] = useState({ q: name, exact: true })
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (open) { setText(name); setTerm({ q: name, exact: true }); setUrl('') }
  }, [open, name])

  const res = useQuery({
    queryKey: ['printings', lang, term.q, term.exact],
    queryFn: () => findPrintings(lang, term.q, term.exact),
    enabled: open && term.q.trim().length > 1,
    staleTime: Infinity,
    retry: 1,
  })
  const list = (res.data ?? []).filter((c) => !excludeSetId || !c.id.startsWith(`${excludeSetId}-`))
  const pick = (image: string, from: string) => { onPick(image, from); onOpenChange(false) }
  const urlOk = /^https:\/\/\S+$/.test(url.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Image for “{name}”</DialogTitle>
          <DialogDescription>
            TCGdex has no picture for this card yet. Reprints reuse the artwork of an earlier printing, so pick that printing below.
            Cards with the same name can have different artwork — check the picture.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setTerm({ q: text, exact: term.exact }) }}>
          <Input className="h-9 min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Card name" aria-label="Card name" />
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={term.exact} onChange={(e) => setTerm({ q: text, exact: e.target.checked })} />Exact name
          </label>
          <Button type="submit" size="sm" variant="outline"><Search />Search</Button>
        </form>

        <div className="min-h-32">
          {res.isFetching && <div className="py-6 text-center text-sm text-fg-muted">Searching TCGdex…</div>}
          {res.error && <div className="py-6 text-center text-sm text-destructive">{(res.error as Error).message}</div>}
          {!res.isFetching && res.data && list.length === 0 && (
            <div className="py-6 text-center text-sm text-fg-muted">
              No printing with an image{term.exact ? ' under this exact name' : ''}.{' '}
              {term.exact && <button className="text-gold underline" onClick={() => setTerm({ q: text, exact: false })}>Search names that contain it</button>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {list.map((c) => (
              <button key={c.id} className="group text-left" onClick={() => pick(c.image!, c.id)} title={`Use the image of ${c.id}`}>
                <Thumb image={c.image} alt={c.name} className="w-full ring-gold/0 transition group-hover:ring-2 group-hover:ring-gold" />
                <div className="mt-1 truncate text-xs text-ivory">{c.name}</div>
                <div className="truncate font-mono text-[10px] text-fg-muted">{c.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <div className="text-xs text-fg-muted">Or paste an image URL (https):</div>
          <div className="flex gap-2">
            <Input className="h-9 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/card.png" aria-label="Image URL" />
            <Button size="sm" disabled={!urlOk} onClick={() => pick(url.trim(), 'url')}>Use URL</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
