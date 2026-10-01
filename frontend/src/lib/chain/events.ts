import { getAbiItem, type Hex } from 'viem'
import { cardCollectionAbi, marketplaceAbi, packSaleAbi } from './abi'
import { ADDR, DEPLOY_BLOCK } from './config'
import { logsClient, publicClient } from './client'

// Tiny in-browser indexer: reads the event logs of the 3 contracts from the deploy block and keeps them in memory.
// Marketplace listings, request history, stats and the activity feed are all derived from here (spec §9).

export type ContractName = 'CardCollection' | 'PackSale' | 'Marketplace'
export type Ev = { contract: ContractName; name: string; args: Record<string, any>; txHash: Hex; block: number; logIndex: number }

const SOURCES: { contract: ContractName; address: Hex; abi: readonly any[]; names: string[] }[] = [
  { contract: 'CardCollection', address: ADDR.collection, abi: cardCollectionAbi, names: ['SetCreated', 'SetRedeemed', 'ApprovalForAll', 'Paused', 'Unpaused'] },
  { contract: 'PackSale', address: ADDR.packSale, abi: packSaleAbi, names: ['PackConfigured', 'PacksPurchased', 'OpenRequested', 'RandomnessReady', 'PackOpened', 'RequestCancelled', 'Withdrawn'] },
  { contract: 'Marketplace', address: ADDR.market, abi: marketplaceAbi, names: ['Listed', 'Sold', 'Cancelled', 'Withdrawn', 'FeeUpdated'] },
]

const seen = new Set<string>()
const events: Ev[] = []
let lastBlock: bigint | null = null
let inflight: Promise<void> | null = null
const REORG_OVERLAP = 12n

async function getLogsChunked(src: (typeof SOURCES)[number], from: bigint, to: bigint): Promise<any[]> {
  const evs = src.names.map((n) => getAbiItem({ abi: src.abi as any, name: n }))
  const out: any[] = []
  let step = 40_000n
  let cur = from
  while (cur <= to) {
    const end = cur + step - 1n > to ? to : cur + step - 1n
    try {
      const logs = await logsClient.getLogs({ address: src.address, events: evs as any, fromBlock: cur, toBlock: end })
      out.push(...logs)
      cur = end + 1n
    } catch (e) {
      if (step <= 500n) throw e
      step = step / 4n // RPC range limit: retry smaller
    }
  }
  return out
}

async function doSync() {
  const latest = await publicClient.getBlockNumber()
  let from: bigint
  if (lastBlock == null) {
    from = DEPLOY_BLOCK > 0n ? DEPLOY_BLOCK : latest > 100_000n ? latest - 100_000n : 0n
  } else {
    from = lastBlock > REORG_OVERLAP ? lastBlock - REORG_OVERLAP : 0n
  }
  if (from > latest) return
  const results = await Promise.all(SOURCES.map((s) => getLogsChunked(s, from, latest).then((logs) => ({ s, logs }))))
  for (const { s, logs } of results) {
    for (const l of logs) {
      const key = `${l.transactionHash}:${l.logIndex}`
      if (seen.has(key)) continue
      if (s.contract === 'CardCollection' && l.eventName === 'ApprovalForAll' && String(l.args.operator).toLowerCase() !== ADDR.market.toLowerCase()) continue
      seen.add(key)
      events.push({ contract: s.contract, name: l.eventName, args: l.args, txHash: l.transactionHash, block: Number(l.blockNumber), logIndex: Number(l.logIndex) })
    }
  }
  events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex)
  lastBlock = latest
}

/** Brings the in-memory log up to the chain head; concurrent callers share one request. */
export function sync(): Promise<void> {
  if (!inflight) inflight = doSync().finally(() => { inflight = null })
  return inflight
}

export function allEvents(): Ev[] { return events }
export const byName = (name: string, contract?: ContractName) => events.filter((e) => e.name === name && (!contract || e.contract === contract))

// ---------- block timestamps ----------
const times = new Map<number, number>()
export async function blockTimes(blocks: number[]): Promise<Map<number, number>> {
  const need = [...new Set(blocks)].filter((b) => !times.has(b))
  for (let i = 0; i < need.length; i += 10) {
    await Promise.all(need.slice(i, i + 10).map(async (b) => {
      try { times.set(b, Number((await publicClient.getBlock({ blockNumber: BigInt(b) })).timestamp) * 1000) } catch { times.set(b, Date.now()) }
    }))
  }
  return times
}
export const iso = (ms: number) => new Date(ms).toISOString()
