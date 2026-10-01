import type { EIP1193Provider } from 'viem'

// Wallet discovery (EIP-6963). `window.ethereum` is a single slot that whichever extension or embedded wallet loads last may take
// over (Privy's embedded provider, among others), so connecting through it blindly can talk to the wrong wallet. Announced
// providers are named, so we can choose: MetaMask first, any other real wallet next, never Privy's embedded one.

export type AnnouncedProvider = { info: { uuid?: string; name?: string; rdns?: string }; provider: EIP1193Provider }
type LegacyProvider = EIP1193Provider & { isMetaMask?: boolean; isPrivy?: boolean; providers?: LegacyProvider[] }
type Legacy = LegacyProvider | null | undefined

const PRIVY = /privy/i
const isPrivyInfo = (i: AnnouncedProvider['info']) => PRIVY.test(i.rdns ?? '') || PRIVY.test(i.name ?? '')
const isMetaMaskInfo = (i: AnnouncedProvider['info']) => i.rdns === 'io.metamask' || i.rdns === 'io.metamask.flask' || i.name === 'MetaMask'

export function pickProvider(announced: AnnouncedProvider[], legacy: Legacy): EIP1193Provider | null {
  const usable = announced.filter((a) => !isPrivyInfo(a.info))
  const mm = usable.find((a) => isMetaMaskInfo(a.info))
  if (mm) return mm.provider
  // Wallets that predate EIP-6963 may sit behind window.ethereum, sometimes as a list when several are installed.
  const legacyList = legacy ? (Array.isArray(legacy.providers) ? legacy.providers : [legacy]) : []
  const legacyMm = legacyList.find((p) => p.isMetaMask && !p.isPrivy)
  if (legacyMm) return legacyMm
  if (usable[0]) return usable[0].provider
  return legacyList.find((p) => !p.isPrivy) ?? null
}

const announced = new Map<string, AnnouncedProvider>()
let listening = false

/** The wallet provider to use, or null. Synchronous: wallets answer `requestProvider` inside the dispatch call. */
export function discoverProvider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null
  if (!listening) {
    listening = true
    window.addEventListener('eip6963:announceProvider', (e) => {
      const d = (e as CustomEvent<AnnouncedProvider>).detail
      if (d?.provider) announced.set(d.info?.uuid ?? d.info?.rdns ?? String(announced.size), d)
    })
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  return pickProvider([...announced.values()], (window as unknown as { ethereum?: Legacy }).ethereum)
}
