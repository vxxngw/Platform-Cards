import type { EIP1193Provider } from 'viem'

// The wallet the app signs with. Privy owns the connection (login modal, embedded or external wallet, account and chain
// changes); PrivyWalletBridge pushes the active wallet here so code outside React (viem clients, the contract adapter)
// can use it. Nothing in the app talks to window.ethereum directly.

export type ActiveWallet = {
  address: `0x${string}`
  provider: EIP1193Provider
  chainId: number | null
  /** 'privy' for the Privy embedded wallet, otherwise the external client ('metamask', 'coinbase_wallet', …). */
  kind: string
  switchChain: (chainId: number) => Promise<void>
}

export type PrivyActions = {
  ready: boolean
  authenticated: boolean
  login: () => void
  connectWallet: () => void
  logout: () => Promise<void>
}

let active: ActiveWallet | null = null
let actions: PrivyActions | null = null
const listeners = new Set<() => void>()

export const activeWallet = () => active
export function setActiveWallet(w: ActiveWallet | null) {
  active = w
  listeners.forEach((l) => l())
}
export function subscribeWallet(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export const privyActions = () => actions
export function setPrivyActions(a: PrivyActions | null) {
  actions = a
}

/** Privy reports chains in CAIP-2 form ('eip155:11155111'); plain numbers and hex are accepted too. */
export function parseChainId(id: string | number | null | undefined): number | null {
  if (id == null || id === '') return null
  if (typeof id === 'number') return Number.isFinite(id) ? id : null
  const raw = id.includes(':') ? id.split(':').pop()! : id
  const n = raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw)
  return Number.isFinite(n) ? n : null
}

type WalletLike = { address: string; type?: string }

/** The wallet to use among Privy's connected wallets (most recently connected first): the first Ethereum one. */
export function pickWallet<W extends WalletLike>(wallets: readonly W[]): W | null {
  return wallets.find((w) => (w.type ?? 'ethereum') === 'ethereum' && /^0x[0-9a-fA-F]{40}$/.test(w.address)) ?? null
}
