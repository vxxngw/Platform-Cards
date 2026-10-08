import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { walletStore } from '../tc'
import { CHAIN_ID, PRIVY_APP_ID } from './config'
import { chain } from './client'
import { activeWallet, privyActions, subscribeWallet } from './providers'

export function useWalletChainId() {
  return useSyncExternalStore(subscribeWallet, () => activeWallet()?.chainId ?? null, () => null)
}

/** 'privy' for the embedded wallet, the external client name otherwise, null when nothing is connected. */
export function useWalletKind() {
  return useSyncExternalStore(subscribeWallet, () => activeWallet()?.kind ?? null, () => null)
}

/** Makes sure the connected wallet is on the app's chain (Sepolia), switching it if needed. */
export async function ensureChain() {
  const w = activeWallet()
  if (!w) throw new Error('No wallet connected. Click “Connect wallet” to sign in.')
  if (w.chainId === CHAIN_ID) return
  try {
    await w.switchChain(CHAIN_ID)
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4001) throw new Error(`Switch your wallet to ${chain.name} to continue.`)
    throw new Error(`Could not switch your wallet to ${chain.name}: ${(e as Error).message}`)
  }
}

/** Opens Privy's login modal (email or wallet), or its connect-wallet modal when already logged in. */
export async function connectWallet(): Promise<void> {
  const a = privyActions()
  if (!PRIVY_APP_ID || !a) {
    toast.error('Wallet not configured', { description: 'VITE_PRIVY_APP_ID is missing from the environment.' })
    throw new Error('privy not configured')
  }
  if (!a.ready) {
    toast('The wallet is still starting', { description: 'Try again in a few seconds. If it persists, check that this domain is in the app’s Allowed origins on the Privy dashboard.' })
    return
  }
  if (a.authenticated) a.connectWallet()
  else a.login()
}

export async function disconnectWallet() {
  try { await privyActions()?.logout() } finally { walletStore.disconnect() }
}
