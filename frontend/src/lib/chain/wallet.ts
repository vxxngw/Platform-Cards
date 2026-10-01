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
  if (!w) throw new Error('Chưa kết nối ví. Bấm “Kết nối ví” để đăng nhập.')
  if (w.chainId === CHAIN_ID) return
  try {
    await w.switchChain(CHAIN_ID)
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 4001) throw new Error(`Bạn cần chuyển ví sang mạng ${chain.name} để tiếp tục.`)
    throw new Error(`Không chuyển được ví sang ${chain.name}: ${(e as Error).message}`)
  }
}

/** Opens Privy's login modal (email or wallet), or its connect-wallet modal when already logged in. */
export async function connectWallet(): Promise<void> {
  const a = privyActions()
  if (!PRIVY_APP_ID || !a) {
    toast.error('Chưa cấu hình ví', { description: 'Thiếu VITE_PRIVY_APP_ID trong biến môi trường.' })
    throw new Error('privy not configured')
  }
  if (!a.ready) {
    toast('Ví đang khởi tạo', { description: 'Thử lại sau vài giây. Nếu vẫn vậy, kiểm tra domain này đã nằm trong Allowed origins của app trên dashboard Privy.' })
    return
  }
  if (a.authenticated) a.connectWallet()
  else a.login()
}

export async function disconnectWallet() {
  try { await privyActions()?.logout() } finally { walletStore.disconnect() }
}
