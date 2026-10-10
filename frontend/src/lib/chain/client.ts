import { createPublicClient, createWalletClient, custom, defineChain, http, type EIP1193Provider, type Hex } from 'viem'
import { CHAIN_ID, CHAIN_NAME, LOGS_RPC_URL, RPC_URL } from './config'
import { discoverProvider } from './providers'

/** The local chain as viem / MetaMask see it (MetaMask adds it with this name and RPC when asked to switch). */
export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
/** Used only for eth_getLogs (see LOGS_RPC_URL). */
export const logsClient = createPublicClient({ chain, transport: http(LOGS_RPC_URL) })

/** EIP-1193 provider of the browser wallet (MetaMask preferred), or null when none is installed. */
export function injected(): EIP1193Provider | null {
  return discoverProvider()
}

export function walletClient() {
  const eth = injected()
  if (!eth) throw new Error('MetaMask is not installed. Install the extension, then reload the page.')
  return createWalletClient({ chain, transport: custom(eth) })
}

/** Reads many calls at once; falls back to individual calls on chains without Multicall3 (the local chain has none). */
export async function readMany<T = unknown>(calls: { address: Hex; abi: any; functionName: string; args?: readonly unknown[] }[]): Promise<T[]> {
  if (calls.length === 0) return []
  try {
    const res = await publicClient.multicall({ contracts: calls as any, allowFailure: false })
    return res as T[]
  } catch {
    return (await Promise.all(calls.map((c) => publicClient.readContract(c as any)))) as T[]
  }
}
