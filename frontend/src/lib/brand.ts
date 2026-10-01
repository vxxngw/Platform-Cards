// Product name, tagline and logo, used in the header, footer, hero, card backs, wallet modal and favicon.
export const BRAND = 'CARDRA'
export const TAGLINE = 'The Royal Card Exchange'

// The logo is optional at build time: drop the file at src/assets/logoMain.png and it is picked up everywhere;
// without it the gold crest is used instead.
const logos = import.meta.glob<string>('/src/assets/logoMain.png', { eager: true, import: 'default', query: '?url' })
export const BRAND_LOGO: string | null = Object.values(logos)[0] ?? null
