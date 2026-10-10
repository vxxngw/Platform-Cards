import { useSyncExternalStore } from 'react'
import { getAddress } from 'viem'
import { toast } from 'sonner'
import { walletStore } from '../tc'
import { CHAIN_ID } from './config'
import { chain, injected } from './client'

// MetaMask, used directly through its EIP-1193 provider. The connected address lives in walletStore (tc.ts) and follows the
// wallet's accountsChanged / chainChanged events.

// ---------- chain id store ----------
let chainIdSnap: number | null = null
const chainListeners = new Set<() => void>()
function setChainId(n: number | null) {
  if (n === chainIdSnap) return
  chainIdSnap = n
  chainListeners.forEach((l) => l())
}
export function useWalletChainId() {
  return useSyncExternalStore((l) => { chainListeners.add(l); return () => { chainListeners.delete(l) } }, () => chainIdSnap, () => null)
}

let inited = false
/** Restores the previous session (if the site is still connected in MetaMask) and follows account / chain changes. Safe to call many times. */
export async function initChainWallet() {
  const eth = injected()
  if (!eth || inited) return
  inited = true
  try {
    setChainId(Number(await eth.request({ method: 'eth_chainId' })))
    const accounts = (await eth.request({ method: 'eth_accounts' })) as string[]
    const cur = walletStore.get().current
    if (accounts[0]) {
      const a = getAddress(accounts[0])
      if (cur !== a) walletStore.select(a)
    } else if (cur) walletStore.disconnect()
  } catch { /* wallet locked or busy: the connect button still works */ }
  const on = eth as unknown as { on?: (ev: string, fn: (...a: any[]) => void) => void }
  on.on?.('accountsChanged', (accs: string[]) => {
    if (accs[0]) walletStore.select(getAddress(accs[0])); else walletStore.disconnect()
  })
  on.on?.('chainChanged', (id: string) => setChainId(Number(id)))
}

/** Makes sure the wallet is on the app's chain (the local chain), switching it — or adding it to MetaMask — if needed. */
export async function ensureChain() {
  const eth = injected()
  if (!eth) throw new Error('MetaMask is not installed. Install the extension, then reload the page.')
  const hex = `0x${CHAIN_ID.toString(16)}` as const
  const id = Number(await eth.request({ method: 'eth_chainId' }))
  setChainId(id)
  if (id === CHAIN_ID) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hex, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [chain.rpcUrls.default.http[0]] }],
      })
    } else if (code === 4001) {
      throw new Error(`Switch your wallet to ${chain.name} to continue.`)
    } else throw new Error(`Could not switch your wallet to ${chain.name}: ${(e as Error).message}`)
  }
  setChainId(Number(await eth.request({ method: 'eth_chainId' })))
}

/** Asks MetaMask for an account, then for the local chain. */
export async function connectWallet(): Promise<string> {
  const eth = injected()
  if (!eth) {
    toast.error('MetaMask is not installed', { description: 'Install the MetaMask extension, import a dev account, then reload the page.' })
    throw new Error('no wallet')
  }
  await initChainWallet()
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    const a = getAddress(accounts[0])
    walletStore.select(a)
    await ensureChain()
    toast.success('Wallet connected', { description: a })
    return a
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4001) toast.error('You rejected the connection request')
    else toast.error('Could not connect the wallet', { description: (e as Error).message })
    throw e
  }
}

/** Forgets the account here and, where MetaMask supports it, drops the site's permission so the next connect asks again. */
export async function disconnectWallet() {
  try {
    await injected()?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] } as never)
  } catch { /* older wallets: disconnect from the MetaMask menu instead */ } finally {
    walletStore.disconnect()
  }
}
