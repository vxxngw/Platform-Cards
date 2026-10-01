import { formatEther, type Hex } from 'viem'
import type { Card, CardSet } from '../tc'
import { cardCollectionAbi, packSaleAbi } from './abi'
import { ADDR, IPFS_GATEWAY } from './config'
import { readMany } from './client'
import { byName, sync } from './events'
import { parseCardMetadata } from '../pokemon/metadata'

const RARITY = ['Common', 'Rare', 'Epic', 'Legendary', 'Reward']

type Meta = ReturnType<typeof parseCardMetadata>

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/']
const withSlash = (g: string) => (g.endsWith('/') ? g : g + '/')

/** `ipfs://CID/1.json` → the same path on several public gateways (the configured one first); other URLs pass through. */
export function gatewayUrls(uri: string): string[] {
  if (!uri.startsWith('ipfs://')) return [uri]
  const path = uri.slice(7).replace(/^ipfs\//, '')
  return [...new Set([IPFS_GATEWAY, ...GATEWAYS].map(withSlash))].map((g) => g + path)
}
export const ipfsToHttp = (u: string) => gatewayUrls(u)[0]

/** Resolves with the first candidate that succeeds (Promise.any without the ES2021 lib). */
function firstSuccess<T>(tasks: (() => Promise<T>)[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0
    tasks.forEach((t) => t().then(resolve, () => { if (++failed === tasks.length) reject(new Error('all gateways failed')) }))
  })
}

async function fetchJson(uri: string): Promise<unknown> {
  return firstSuccess(gatewayUrls(uri).map((u) => async () => {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  }))
}

// id|uri → parsed metadata. Successes are kept for the session; failures are retried after a minute so a dead base URI
// (e.g. before the first publish) does not hit every gateway on each 10 s catalog refresh.
const metaCache = new Map<string, { at: number; json: unknown | null; p?: Promise<unknown | null> }>()
const FAIL_RETRY_MS = 60_000
/** Raw metadata JSON of every token fetched so far — the Pack Builder re-pins these when it publishes a new folder. */
const rawByTokenId = new Map<number, unknown>()

function fetchMeta(id: number, uri: string): Promise<unknown | null> {
  const key = `${id}|${uri}`
  const hit = metaCache.get(key)
  if (hit?.p) return hit.p
  if (hit && (hit.json || Date.now() - hit.at < FAIL_RETRY_MS)) return Promise.resolve(hit.json)
  const p = fetchJson(uri).then(
    (json) => { metaCache.set(key, { at: Date.now(), json }); rawByTokenId.set(id, json); return json },
    () => { metaCache.set(key, { at: Date.now(), json: null }); return null },
  )
  metaCache.set(key, { at: hit?.at ?? 0, json: null, p })
  return p
}

export function knownRawMetadata(): Record<number, unknown> {
  return Object.fromEntries(rawByTokenId)
}

export type Catalog = { sets: CardSet[]; cards: Map<number, Card>; at: number }
let cached: Catalog | null = null
let inflight: Promise<Catalog> | null = null
const TTL = 10_000

async function build(): Promise<Catalog> {
  await sync()
  const C = ADDR.collection
  const P = ADDR.packSale
  const [nextSetId] = await readMany<bigint>([{ address: C, abi: cardCollectionAbi, functionName: 'nextSetId' }])
  const setIds = Array.from({ length: Number(nextSetId) - 1 }, (_, i) => i + 1)

  const setCalls = setIds.flatMap((id) => [
    { address: C, abi: cardCollectionAbi, functionName: 'getSet', args: [BigInt(id)] },
    { address: P, abi: packSaleAbi, functionName: 'packConfigs', args: [BigInt(id)] },
  ])
  const setRes = await readMany<any>(setCalls)

  type RawSet = { id: number; name: string; cardIds: number[]; rewardId: number; pack: any }
  const raw: RawSet[] = setIds.map((id, i) => {
    const [name, cardIds, rewardId] = setRes[i * 2] as [string, bigint[], bigint, boolean]
    return { id, name, cardIds: cardIds.map(Number), rewardId: Number(rewardId), pack: setRes[i * 2 + 1] }
  })

  const allIds = raw.flatMap((s) => [...s.cardIds, s.rewardId])
  const cardCalls = allIds.flatMap((id) => [
    { address: C, abi: cardCollectionAbi, functionName: 'cards', args: [BigInt(id)] },
    { address: C, abi: cardCollectionAbi, functionName: 'totalSupply', args: [BigInt(id)] },
    { address: C, abi: cardCollectionAbi, functionName: 'uri', args: [BigInt(id)] },
  ])
  const cardRes = await readMany<any>(cardCalls)
  const metas: Meta[] = (await Promise.all(allIds.map((id, i) => fetchMeta(id, cardRes[i * 3 + 2] as string)))).map(parseCardMetadata)

  const redeemed = new Map<number, number>()
  for (const e of byName('SetRedeemed')) redeemed.set(Number(e.args.setId), (redeemed.get(Number(e.args.setId)) ?? 0) + 1)

  const cards = new Map<number, Card>()
  allIds.forEach((id, i) => {
    const [setId, rarity, maxSupply, isReward] = cardRes[i * 3] as [bigint, number, bigint, boolean]
    const supply = Number(cardRes[i * 3 + 1])
    const set = raw.find((s) => s.id === Number(setId))!
    const burned = isReward ? 0 : redeemed.get(set.id) ?? 0
    const r = isReward ? 4 : Number(rarity)
    const m = metas[i]
    cards.set(id, {
      id, setId: set.id, name: m?.name || (isReward ? `${set.name} reward` : `Card #${id}`), rarity: r, rarityName: RARITY[r],
      maxSupply: Number(maxSupply), supply, minted: supply + burned, burned,
      cardNo: isReward ? 0 : set.cardIds.indexOf(id) + 1, hue: m?.hue ?? (id * 47) % 360, isReward, priceRef: m?.priceRef ?? null,
      image: m?.image ?? null, setName: m?.setName, localId: m?.localId, officialRarity: m?.officialRarity, tcgdexId: m?.tcgdexId, lang: m?.lang,
    })
  })

  // PackConfig has no "total": it is the supply passed to the latest configurePack.
  const lastCfg = new Map<number, number>()
  for (const e of byName('PackConfigured')) lastCfg.set(Number(e.args.setId), Number(e.args.supply))

  const sets: CardSet[] = raw.map((s) => {
    const cfg = s.pack as readonly [bigint, bigint, bigint, boolean]
    const configured = cfg[1] > 0n || cfg[2] > 0n || cfg[3]
    const remaining = Number(cfg[2])
    const first = cardRes[allIds.indexOf(s.cardIds[0]) * 3 + 2] as string | undefined
    const head = cards.get(s.cardIds[0])
    // v2 sets carry the real Pokémon set in their metadata; the on-chain name is what the admin typed
    const source = head?.setName ? { setName: head.setName, tcgdexSetId: head.tcgdexId?.replace(/-[^-]+$/, ''), lang: head.lang } : undefined
    return {
      id: s.id, name: s.name, source,
      description: source ? `${s.cardIds.length} cards from the Pokémon TCG set “${source.setName}” (TCGdex data), plus a reward card for completing the set.` : `${s.cardIds.length} cards, plus a reward card for completing the set.`,
      rewardCardId: s.rewardId, baseUri: first ? first.replace(/[^/]*$/, '') : '',
      pack: configured ? { price: formatEther(cfg[1]), remaining, total: Math.max(lastCfg.get(s.id) ?? remaining, remaining), onSale: cfg[3] } : null,
      cards: [...s.cardIds, s.rewardId].map((id) => cards.get(id)!),
    }
  })
  return { sets, cards, at: Date.now() }
}

export async function getCatalog(force = false): Promise<Catalog> {
  if (!force && cached && Date.now() - cached.at < TTL) return cached
  if (!inflight) inflight = build().then((c) => (cached = c)).finally(() => { inflight = null })
  return inflight
}
export const invalidateCatalog = () => { cached = null }
export type { Hex }
