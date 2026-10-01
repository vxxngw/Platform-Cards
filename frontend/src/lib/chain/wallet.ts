import { useSyncExternalStore } from 'react'
import { getAddress } from 'viem'
import { toast } from 'sonner'
import { walletStore } from '../tc'
import { CHAIN_ID } from './config'
import { chain, injected } from './client'

// ---------- chain id store ----------
let chainIdSnap: number | null = null
const chainListeners = new Set<() => void>()
function setChainId(n: number | null) {
  if (n === chainIdSnap) return
  chainIdSnap = n
  chainListeners.forEach((l) => l())
}
export function useWalletChainId() {
  return useSyncExternalStore((l) => { chainListeners.add(l); return () => chainListeners.delete(l) }, () => chainIdSnap, () => null)
}

let inited = false
/** Restore the previous session and keep the store in sync with MetaMask. Safe to call many times. */
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
  } catch { /* ignore */ }
  const on = eth as unknown as { on?: (ev: string, fn: (...a: any[]) => void) => void }
  on.on?.('accountsChanged', (accs: string[]) => {
    if (accs[0]) walletStore.select(getAddress(accs[0])); else walletStore.disconnect()
  })
  on.on?.('chainChanged', (id: string) => setChainId(Number(id)))
}

export async function ensureChain() {
  const eth = injected()
  if (!eth) throw new Error('Chưa cài MetaMask. Cài tiện ích ví rồi tải lại trang.')
  const id = Number(await eth.request({ method: 'eth_chainId' }))
  setChainId(id)
  if (id === CHAIN_ID) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] })
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${CHAIN_ID.toString(16)}`, chainName: chain.name, nativeCurrency: chain.nativeCurrency,
          rpcUrls: [chain.rpcUrls.default.http[0]], blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        }],
      })
    } else if (code === 4001) {
      throw new Error(`Bạn cần chuyển ví sang mạng ${chain.name} để tiếp tục.`)
    } else throw e
  }
  setChainId(Number(await eth.request({ method: 'eth_chainId' })))
}

export async function connectInjected() {
  const eth = injected()
  if (!eth) {
    toast.error('Chưa cài MetaMask', { description: 'Cài tiện ích MetaMask rồi tải lại trang.' })
    throw new Error('no wallet')
  }
  await initChainWallet()
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    walletStore.select(getAddress(accounts[0]))
    await ensureChain()
    toast.success('Đã kết nối ví', { description: accounts[0] })
    return accounts[0]
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4001) toast.error('Bạn đã từ chối kết nối ví')
    else toast.error('Không kết nối được ví', { description: (e as Error).message })
    throw e
  }
}
