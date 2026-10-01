import { createPublicClient, createWalletClient, custom, http, type EIP1193Provider, type Hex } from 'viem'
import { hardhat, sepolia } from 'viem/chains'
import { CHAIN_ID, LOGS_RPC_URL, RPC_URL } from './config'
import { activeWallet } from './providers'

export const chain = CHAIN_ID === 31337 ? hardhat : sepolia

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
/** Used only for eth_getLogs (see LOGS_RPC_URL). */
export const logsClient = createPublicClient({ chain, transport: http(LOGS_RPC_URL) })

/** EIP-1193 provider of the wallet connected through Privy, or null. */
export function injected(): EIP1193Provider | null {
  return activeWallet()?.provider ?? null
}

export function walletClient() {
  const eth = injected()
  if (!eth) throw new Error('Chưa kết nối ví. Bấm “Kết nối ví” để đăng nhập.')
  return createWalletClient({ chain, transport: custom(eth) })
}

/** Reads many calls at once; falls back to individual calls on chains without Multicall3 (local hardhat). */
export async function readMany<T = unknown>(calls: { address: Hex; abi: any; functionName: string; args?: readonly unknown[] }[]): Promise<T[]> {
  if (calls.length === 0) return []
  try {
    const res = await publicClient.multicall({ contracts: calls as any, allowFailure: false })
    return res as T[]
  } catch {
    return (await Promise.all(calls.map((c) => publicClient.readContract(c as any)))) as T[]
  }
}
