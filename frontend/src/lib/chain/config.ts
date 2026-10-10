const env = import.meta.env as Record<string, string | undefined>

// The private local chain (contracts/localnet): one geth Clique chain, two nodes. The app talks to node 2, the RPC node.
// `npm run deploy:local` in contracts/ writes the real values to frontend/.env.local.
export const CHAIN_ID = Number(env.VITE_CHAIN_ID || 105701)
export const CHAIN_NAME = env.VITE_CHAIN_NAME || 'Localnet'
export const RPC_URL = env.VITE_RPC_URL || 'http://127.0.0.1:8546'
// eth_getLogs may need an endpoint with a wider block range than RPC_URL; the local node has no limit.
export const LOGS_RPC_URL = env.VITE_LOGS_RPC_URL || RPC_URL
export const DEPLOY_BLOCK = BigInt(env.VITE_DEPLOY_BLOCK || 0)
/** Primary / legacy single-admin address (kept for backward-compat). */
export const ADMIN_ADDRESS = (env.VITE_ADMIN_ADDRESS || '').toLowerCase()

/**
 * Multi-admin list.
 * Set VITE_ADMIN_ADDRESSES to a comma-separated list of addresses, e.g.:
 *   VITE_ADMIN_ADDRESSES=0xAbc...,0xDef...
 * Falls back to VITE_ADMIN_ADDRESS when VITE_ADMIN_ADDRESSES is not set.
 */
export const ADMIN_ADDRESSES: string[] = (() => {
  const raw = env.VITE_ADMIN_ADDRESSES || env.VITE_ADMIN_ADDRESS || ''
  return raw
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
})()

/** Returns true if `addr` is in the configured admin list. */
export const isAdminAddr = (addr: string | null | undefined): boolean =>
  !!addr && ADMIN_ADDRESSES.includes(addr.toLowerCase())
export const IPFS_GATEWAY = env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/'

export const ADDR = {
  collection: (env.VITE_COLLECTION_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  packSale: (env.VITE_PACKSALE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  market: (env.VITE_MARKETPLACE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
}

// A private chain has no public block explorer: links appear only if VITE_EXPLORER_URL points at one (e.g. a local Blockscout).
export const EXPLORER = (env.VITE_EXPLORER_URL || '').replace(/\/+$/, '')
export const txUrl = (hash: string) => (EXPLORER ? `${EXPLORER}/tx/${hash}` : '')
export const addrUrl = (a: string) => (EXPLORER ? `${EXPLORER}/address/${a}` : '')

export const MAX_PACKS_PER_TX = 10
export const REWARD_MAX_SUPPLY = 50
