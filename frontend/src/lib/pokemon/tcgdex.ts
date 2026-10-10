// Thin TCGdex v2 client (https://tcgdex.dev). Free, no key, and it sends `Access-Control-Allow-Origin: *`,
// so the Pack Builder calls it straight from the browser (no /api/tcgdex proxy needed).
import { mapLimit, sleep } from './async'
import type { TcgdexCard, TcgdexCardBrief, TcgdexSet, TcgdexSetBrief } from './types'

export const TCGDEX_BASE = 'https://api.tcgdex.net/v2'

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt-br', label: 'Português (BR)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'zh-tw', label: '繁體中文' },
] as const

async function getJson<T>(url: string, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12_000) })
      if (!r.ok) throw new Error(`TCGdex answered ${r.status}`)
      return (await r.json()) as T
    } catch (e) {
      if (attempt >= retries) throw e
      await sleep(400 * (attempt + 1))
    }
  }
}

// Session-lifetime memo so switching language/set back and forth does not refetch.
const memo = new Map<string, Promise<unknown>>()
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined
  if (!p) {
    p = fn().catch((e) => { memo.delete(key); throw e })
    memo.set(key, p)
  }
  return p
}

export const listSets = (lang: string) => cached(`sets:${lang}`, () => getJson<TcgdexSetBrief[]>(`${TCGDEX_BASE}/${lang}/sets`))
export const getSet = (lang: string, id: string) => cached(`set:${lang}:${id}`, () => getJson<TcgdexSet>(`${TCGDEX_BASE}/${lang}/sets/${encodeURIComponent(id)}`))
export const getCard = (lang: string, id: string) => cached(`card:${lang}:${id}`, () => getJson<TcgdexCard>(`${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(id)}`))
/**
 * Printings of a card name that do have an image. Reprint sets (a Classic Collection, or a set announced before
 * release) often have no images on TCGdex yet but reuse the artwork of an earlier printing, so the admin can borrow it.
 * `exact` matches the whole name; otherwise TCGdex matches names that contain the text.
 */
export async function findPrintings(lang: string, name: string, exact = true): Promise<TcgdexCardBrief[]> {
  const q = name.trim()
  if (!q) return []
  const filter = exact ? `eq:${q}` : q
  const list = await cached(`print:${lang}:${filter}`, () => getJson<TcgdexCardBrief[]>(`${TCGDEX_BASE}/${lang}/cards?name=${encodeURIComponent(filter)}`))
  return list.filter((c) => !!c.image)
}

/** The first other printing with the exact same name (outside `excludeSetId`), or null. The admin should still check the picture. */
export async function suggestPrinting(lang: string, name: string, excludeSetId?: string): Promise<TcgdexCardBrief | null> {
  const list = await findPrintings(lang, name, true)
  return list.find((c) => !excludeSetId || !c.id.startsWith(`${excludeSetId}-`)) ?? null
}

export const listRarities = (lang: string) => cached(`rarities:${lang}`, () => getJson<string[]>(`${TCGDEX_BASE}/${lang}/rarities`))

/**
 * Official rarity of every card in a set, without fetching each card: one filtered list per rarity value
 * (`/cards?set.id=eq:<set>&rarity=eq:<rarity>`), ~40 tiny requests that finish in a couple of seconds.
 */
export function rarityMapForSet(lang: string, setId: string, rarities: string[], onProgress?: (done: number, total: number) => void): Promise<Map<string, string>> {
  return cached(`rmap:${lang}:${setId}`, async () => {
    const map = new Map<string, string>()
    let done = 0
    await mapLimit(rarities, 8, async (r) => {
      const url = `${TCGDEX_BASE}/${lang}/cards?set.id=eq:${encodeURIComponent(setId)}&rarity=eq:${encodeURIComponent(r)}`
      try {
        const list = await getJson<{ id: string }[]>(url)
        for (const c of list) map.set(c.id, r)
      } finally {
        onProgress?.(++done, rarities.length)
      }
    })
    return map
  })
}
