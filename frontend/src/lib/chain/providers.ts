import type { EIP1193Provider } from 'viem'

// The browser wallet the app signs with (MetaMask, connected directly, no wallet SDK in between).
// Wallet discovery uses EIP-6963: `window.ethereum` is a single slot that whichever extension loads last may take over, while
// announced providers are named, so we can choose — MetaMask first, any other wallet next, window.ethereum last.

export type AnnouncedProvider = { info: { uuid?: string; name?: string; rdns?: string }; provider: EIP1193Provider }
type LegacyProvider = EIP1193Provider & { isMetaMask?: boolean; providers?: LegacyProvider[] }
type Legacy = LegacyProvider | null | undefined

const isMetaMaskInfo = (i: AnnouncedProvider['info']) => i.rdns === 'io.metamask' || i.rdns === 'io.metamask.flask' || i.name === 'MetaMask'

export function pickProvider(announced: AnnouncedProvider[], legacy: Legacy): EIP1193Provider | null {
  const mm = announced.find((a) => isMetaMaskInfo(a.info))
  if (mm) return mm.provider
  // Wallets that predate EIP-6963 sit behind window.ethereum, sometimes as a list when several are installed.
  const legacyList = legacy ? (Array.isArray(legacy.providers) ? legacy.providers : [legacy]) : []
  const legacyMm = legacyList.find((p) => p.isMetaMask)
  if (legacyMm) return legacyMm
  if (announced[0]) return announced[0].provider
  return legacyList[0] ?? null
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
