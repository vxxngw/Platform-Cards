const env = import.meta.env as Record<string, string | undefined>

export const CHAIN_ID = Number(env.VITE_CHAIN_ID || 11155111) // Sepolia
export const RPC_URL = env.VITE_RPC_URL || undefined
// eth_getLogs often has tight range limits (Alchemy free tier: 10 blocks), so logs may use a different endpoint.
export const LOGS_RPC_URL = env.VITE_LOGS_RPC_URL || (CHAIN_ID === 11155111 ? 'https://ethereum-sepolia-rpc.publicnode.com' : RPC_URL)
export const DEPLOY_BLOCK = BigInt(env.VITE_DEPLOY_BLOCK || 0)
export const ADMIN_ADDRESS = (env.VITE_ADMIN_ADDRESS || '').toLowerCase()
// Privy App ID (public, from dashboard.privy.io). The App secret is never needed in the browser.
export const PRIVY_APP_ID = env.VITE_PRIVY_APP_ID || ''
export const IPFS_GATEWAY = env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'

export const ADDR = {
  collection: (env.VITE_COLLECTION_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  packSale: (env.VITE_PACKSALE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  market: (env.VITE_MARKETPLACE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
}

export const EXPLORER = CHAIN_ID === 11155111 ? 'https://sepolia.etherscan.io' : ''
export const txUrl = (hash: string) => (EXPLORER ? `${EXPLORER}/tx/${hash}` : '')
export const addrUrl = (a: string) => (EXPLORER ? `${EXPLORER}/address/${a}` : '')

export const MAX_PACKS_PER_TX = 10
export const REWARD_MAX_SUPPLY = 50
