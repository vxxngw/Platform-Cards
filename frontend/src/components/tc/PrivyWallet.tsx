import { useEffect, type ReactNode } from 'react'
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { getAddress, type EIP1193Provider } from 'viem'
import { walletStore } from '@/lib/tc'
import { PRIVY_APP_ID } from '@/lib/chain/config'
import { BRAND_LOGO } from '@/lib/brand'
import { chain } from '@/lib/chain/client'
import { parseChainId, pickWallet, setActiveWallet, setPrivyActions, type ActiveWallet } from '@/lib/chain/providers'

/**
 * Privy is the only wallet layer: email login gets a Privy embedded wallet, MetaMask & co. connect as external wallets.
 * Without VITE_PRIVY_APP_ID the app still renders (read-only); the connect button explains what is missing.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <>{children}</>
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email'],
        appearance: {
          theme: 'dark',
          ...(BRAND_LOGO ? { logo: BRAND_LOGO } : {}),
          accentColor: '#ff2974',
          walletChainType: 'ethereum-only',
          showWalletLoginFirst: true,
          landingHeader: 'Enter the Realm',
          loginMessage: 'Sepolia testnet only — no real money.',
        },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivyWalletBridge />
      {children}
    </PrivyProvider>
  )
}

/** Mirrors Privy's state into the app's wallet store (address, EIP-1193 provider, chain) and exposes login/logout. */
function PrivyWalletBridge() {
  const { ready, authenticated, login, logout, connectWallet } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()

  useEffect(() => {
    setPrivyActions({ ready, authenticated, login: () => login(), connectWallet: () => connectWallet(), logout })
    return () => setPrivyActions(null)
  }, [ready, authenticated, login, logout, connectWallet])

  const w = pickWallet(wallets)
  const key = w ? `${w.address}|${w.chainId}|${w.walletClientType}` : ''

  useEffect(() => {
    if (!ready || !walletsReady) return
    if (!authenticated || !w) {
      setActiveWallet(null)
      if (walletStore.get().current) walletStore.disconnect()
      return
    }
    let cancelled = false
    const address = getAddress(w.address)
    const make = async (chainId: number | null): Promise<ActiveWallet> => ({
      address,
      // Privy's provider type differs from viem's only in the `on` listener typing; viem calls just `request`.
      provider: (await w.getEthereumProvider()) as unknown as EIP1193Provider,
      chainId,
      kind: w.walletClientType,
      // Privy: switching does not update existing provider instances, so fetch a fresh one afterwards.
      switchChain: async (id) => {
        await w.switchChain(id)
        setActiveWallet(await make(id))
      },
    })
    make(parseChainId(w.chainId)).then((aw) => {
      if (cancelled) return
      setActiveWallet(aw)
      if (walletStore.get().current !== address) walletStore.select(address)
    })
    return () => { cancelled = true }
    // `key` captures the wallet's identity and chain; `w` itself is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walletsReady, authenticated, key])

  return null
}
