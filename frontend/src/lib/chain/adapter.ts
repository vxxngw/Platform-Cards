// Implements the `tc/*` REST-style surface straight on the 3 contracts (viem); there is no server behind it.
// tc.ts routes every `tc/*` call here.
import { BaseError, ContractFunctionRevertedError, formatEther, getAddress, keccak256, parseEther, parseEventLogs, toBytes, type Hex } from 'viem'
import type { Card, ChainEvent, CollectionSet, Config, Listing, Me, OpenRequest } from '../tc'
import { cardCollectionAbi, marketplaceAbi, packSaleAbi } from './abi'
import { ADDR, ADMIN_ADDRESS, CHAIN_ID, LOGS_RPC_URL, MAX_PACKS_PER_TX, REWARD_MAX_SUPPLY, RPC_URL } from './config'
import { publicClient, readMany, walletClient } from './client'
import { getCatalog, invalidateCatalog, knownRawMetadata } from './catalog'
import { allEvents, blockTimes, byName, iso, sync, type Ev } from './events'
import { ensureChain } from './wallet'

export type TxCtx = { onHash?: (hash: Hex) => void }
type Init = (RequestInit & { json?: any }) & { ctx?: TxCtx }

const C = ADDR.collection
const P = ADDR.packSale
const M = ADDR.market
const ADMIN_ROLE = keccak256(toBytes('ADMIN_ROLE'))

// ---------- errors ----------
const REVERTS: Record<string, string> = {
  WrongValue: 'The ETH sent does not match the price.',
  BadQuantity: `Pack quantity must be between 1 and ${MAX_PACKS_PER_TX}.`,
  SoldOut: 'Not enough packs left.',
  NotOnSale: 'Packs of this set are not on sale.',
  NotEnoughPacks: 'You do not have enough unopened packs.',
  NotStuck: 'The request is less than an hour old or was already handled.',
  NotClaimable: 'The random number has not arrived yet, or these cards were already claimed.',
  AllCardsExhausted: 'Every card in this set has reached its max supply.',
  MaxSupplyExceeded: 'This card has reached its max supply.',
  InvalidSetSize: 'A set must have 8–12 cards.',
  LengthMismatch: 'Rarities and max supplies do not line up.',
  UnknownSet: 'This set does not exist.',
  IncompleteSet: 'You do not own every card of this set yet.',
  InvalidPrice: 'The price must be greater than 0.',
  InvalidAmount: 'The amount must be greater than 0.',
  NotActive: 'This listing was already sold or cancelled.',
  SelfBuy: 'You cannot buy your own listing.',
  NotSeller: 'Only the seller can cancel this listing.',
  NothingToWithdraw: 'There is no ETH to withdraw.',
  FeeTooHigh: 'The fee is capped at 1000 bps (10%).',
  EnforcedPause: 'The contracts are paused.',
  AccessControlUnauthorizedAccount: 'This wallet is not an admin.',
  ERC1155MissingApprovalForAll: 'Approve the Marketplace (setApprovalForAll) first.',
  ERC1155InsufficientBalance: 'You do not hold enough of this card.',
}

export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const rejected = e.walk((x) => (x as { code?: number }).code === 4001 || (x as Error).name === 'UserRejectedRequestError')
    if (rejected) return 'You rejected the request in your wallet.'
    const funds = e.walk((x) => (x as Error).name === 'InsufficientFundsError')
    if (funds) return 'Not enough ETH for the price plus gas.'
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (rev) {
      const n = rev.data?.errorName
      if (n && REVERTS[n]) return REVERTS[n]
      if (/0x79bfd401/.test(rev.message)) return 'PackSale is not a consumer of the VRF subscription yet (vrf.chain.link).'
      return rev.reason || n || rev.shortMessage
    }
    if (/0x79bfd401/.test(e.message)) return 'PackSale is not a consumer of the VRF subscription yet (vrf.chain.link).'
    if (/0x1f6a65b6/.test(e.message)) return 'The VRF subscription does not exist or the subscriptionId is wrong.'
    return e.shortMessage || e.message
  }
  return (e as Error)?.message || 'Unknown error'
}

async function write(ctx: TxCtx | undefined, from: string, address: Hex, abi: readonly any[], functionName: string, args: unknown[] = [], value?: bigint) {
  try {
    await ensureChain()
    const account = getAddress(from)
    const { request } = await publicClient.simulateContract({ address, abi, functionName, args, value, account } as any)
    const hash = await walletClient().writeContract(request as any)
    ctx?.onHash?.(hash)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('The transaction reverted on chain.')
    invalidateCatalog()
    return { hash, receipt }
  } catch (e) {
    throw new Error(explain(e))
  }
}

const need = (addr: string | null) => {
  if (!addr) throw new Error('Connect your wallet first.')
  return addr
}
const num = (v: unknown) => Number(v)
const rd = <T>(address: Hex, abi: readonly any[], functionName: string, args?: unknown[]) =>
  publicClient.readContract({ address, abi, functionName, args } as any) as Promise<T>

// ---------- event shaping ----------
const WEI_KEYS = new Set(['price', 'paid'])
function plain(name: string, args: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(args ?? {})) {
    if (typeof v === 'bigint') out[k] = WEI_KEYS.has(k) || (name === 'Withdrawn' && k === 'amount') || k === 'reqId' ? v.toString() : Number(v)
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'bigint' ? Number(x) : x))
    else out[k] = v
  }
  return out
}

type Active = { listingId: number; seller: string; ids: number[]; amounts: number[]; price: bigint; isBundle: boolean; block: number }
function activeListings(): Active[] {
  const map = new Map<number, Active>()
  for (const e of allEvents()) {
    if (e.contract !== 'Marketplace') continue
    if (e.name === 'Listed') {
      const a = e.args
      map.set(num(a.listingId), { listingId: num(a.listingId), seller: a.seller, ids: a.ids.map(num), amounts: a.amounts.map(num), price: a.price, isBundle: a.isBundle, block: e.block })
    } else if (e.name === 'Sold' || e.name === 'Cancelled') map.delete(num(e.args.listingId))
  }
  return [...map.values()]
}

// ---------- GET handlers ----------
async function getConfig(): Promise<Config> {
  const [paused, feeBps, accrued, packBal] = await Promise.all([
    rd<boolean>(C, cardCollectionAbi, 'paused'),
    rd<bigint>(M, marketplaceAbi, 'feeBps'),
    rd<bigint>(M, marketplaceAbi, 'accruedFees'),
    publicClient.getBalance({ address: P }),
  ])
  return { adminAddress: ADMIN_ADDRESS, paused, feeBps: num(feeBps), packRevenue: formatEther(packBal), marketFees: formatEther(accrued), maxPacksPerTx: MAX_PACKS_PER_TX }
}

async function getMe(addr: string | null): Promise<Me> {
  if (!addr) return { wallet: null }
  const a = getAddress(addr)
  // Wallet and role reads come first and on their own: a failing event-log sync must not hide the admin role.
  const [balance, isAdmin, approved, pending] = await Promise.all([
    publicClient.getBalance({ address: a }),
    rd<boolean>(C, cardCollectionAbi, 'hasRole', [ADMIN_ROLE, a]),
    rd<boolean>(C, cardCollectionAbi, 'isApprovedForAll', [a, M]),
    rd<bigint>(M, marketplaceAbi, 'pendingWithdrawals', [a]),
  ])
  let unopened: { setId: number; name: string; count: number }[] = []
  let reqs: string[] = []
  try {
    const cat = await getCatalog()
    const counts = await readMany<bigint>(cat.sets.map((s) => ({ address: P, abi: packSaleAbi, functionName: 'unopened', args: [a, BigInt(s.id)] })))
    unopened = cat.sets.map((s, i) => ({ setId: s.id, name: s.name, count: num(counts[i]) })).filter((u) => u.count > 0)
    reqs = requestsOf(a).filter((r) => r.status === 'pending' || r.status === 'ready').map((r) => r.reqId)
  } catch (e) {
    console.warn('[me] sets/events unavailable:', explain(e))
  }
  return {
    wallet: { address: a, label: null, isAdmin, marketApproved: approved, balance: formatEther(balance), pending: formatEther(pending) },
    unopened, pendingRequests: reqs.reverse(),
  }
}

/** Step-by-step health check of the deployment, shown on /admin when the connected wallet is not recognised. */
export type Diagnostics = Record<string, unknown>
async function getDiagnostics(addr: string | null): Promise<Diagnostics> {
  const out: Diagnostics = {
    connected: addr, expectedChainId: CHAIN_ID, adminAddressEnv: ADMIN_ADDRESS || null,
    rpc: RPC_URL ? RPC_URL.replace(/(\/v\d+\/|\/v2\/|key=)[^/?&]+/i, '$1…') : 'viem default public RPC', logsRpc: LOGS_RPC_URL ?? null,
    collection: C, packSale: P, marketplace: M,
  }
  const step = async (k: string, fn: () => Promise<unknown>) => { try { out[k] = await fn() } catch (e) { out[k] = { error: explain(e) } } }
  await step('rpcChainId', () => publicClient.getChainId())
  await step('collectionDeployed', async () => ((await publicClient.getCode({ address: C })) ?? '0x') !== '0x')
  if (addr) await step('hasAdminRole', () => rd<boolean>(C, cardCollectionAbi, 'hasRole', [ADMIN_ROLE, getAddress(addr)]))
  await step('eventLogs', async () => { await sync(); return `${allEvents().length} events indexed` })
  return out
}

async function getCollection(addr: string | null): Promise<CollectionSet[]> {
  const cat = await getCatalog()
  const a = addr ? getAddress(addr) : null
  const allIds = cat.sets.flatMap((s) => s.cards.map((c) => c.id))
  const bals = a ? await readMany<bigint>(allIds.map((id) => ({ address: C, abi: cardCollectionAbi, functionName: 'balanceOf', args: [a, BigInt(id)] }))) : []
  const bal = new Map(allIds.map((id, i) => [id, a ? num(bals[i]) : 0]))
  const escrow = new Map<number, number>()
  if (a) for (const l of activeListings()) if (l.seller.toLowerCase() === a.toLowerCase()) l.ids.forEach((id, i) => escrow.set(id, (escrow.get(id) ?? 0) + l.amounts[i]))
  return cat.sets.map((s) => {
    const main = s.cards.filter((c) => !c.isReward)
    const owned = main.filter((c) => (bal.get(c.id) ?? 0) > 0).length
    return {
      id: s.id, name: s.name, total: main.length, owned, complete: owned === main.length,
      cards: s.cards.map((c) => ({ ...c, balance: bal.get(c.id) ?? 0, listed: escrow.get(c.id) ?? 0 })),
    }
  })
}

async function getListings(query: URLSearchParams): Promise<Listing[]> {
  const cat = await getCatalog()
  const rows = activeListings().sort((a, b) => b.listingId - a.listingId).slice(0, 300)
  const times = await blockTimes(rows.slice(0, 100).map((r) => r.block))
  let out: Listing[] = rows.map((l) => {
    const first = cat.cards.get(l.ids[0])
    const set = cat.sets.find((s) => s.id === first?.setId)
    return {
      listingId: l.listingId, seller: l.seller, isBundle: l.isBundle, setId: first?.setId ?? 0, setName: set?.name ?? '',
      price: formatEther(l.price), priceWei: l.price.toString(), createdAt: iso(times.get(l.block) ?? Date.now()),
      items: l.ids.map((id, i) => ({ card: cat.cards.get(id), amount: l.amounts[i] })),
    }
  })
  const setId = query.get('setId'), rarity = query.get('rarity'), kind = query.get('kind'), sort = query.get('sort')
  if (setId) out = out.filter((l) => l.setId === Number(setId))
  if (kind === 'single') out = out.filter((l) => !l.isBundle)
  if (kind === 'bundle') out = out.filter((l) => l.isBundle)
  if (rarity !== null && rarity !== '') out = out.filter((l) => l.items.some((it) => it.card?.rarity === Number(rarity)))
  const wei = (v: string | null) => { try { return v ? parseEther(v) : null } catch { return null } }
  const min = wei(query.get('min')), max = wei(query.get('max'))
  if (min != null) out = out.filter((l) => BigInt(l.priceWei) >= min)
  if (max != null) out = out.filter((l) => BigInt(l.priceWei) <= max)
  if (sort === 'price_asc') out.sort((a, b) => (BigInt(a.priceWei) < BigInt(b.priceWei) ? -1 : 1))
  if (sort === 'price_desc') out.sort((a, b) => (BigInt(a.priceWei) > BigInt(b.priceWei) ? -1 : 1))
  return out
}

function requestsOf(buyer?: string) {
  const st = new Map<string, { ready?: any; fulfilled?: any; cancelled?: any }>()
  for (const e of allEvents()) {
    if (e.contract !== 'PackSale') continue
    const id = String(e.args.reqId)
    if (e.name === 'RandomnessReady') st.set(id, { ...st.get(id), ready: e })
    if (e.name === 'PackOpened') st.set(id, { ...st.get(id), fulfilled: e })
    if (e.name === 'RequestCancelled') st.set(id, { ...st.get(id), cancelled: e })
  }
  return byName('OpenRequested', 'PackSale')
    .filter((e) => !buyer || String(e.args.buyer).toLowerCase() === buyer.toLowerCase())
    .map((e) => {
      const id = String(e.args.reqId)
      const d = st.get(id)
      // pending → (VRF) ready → (claimPacks) fulfilled
      const status = d?.fulfilled ? 'fulfilled' : d?.cancelled ? 'cancelled' : d?.ready ? 'ready' : 'pending'
      return { reqId: id, ev: e, fulfilled: d?.fulfilled, cancelled: d?.cancelled, status }
    })
}

async function toRequestView(r: ReturnType<typeof requestsOf>[number]): Promise<OpenRequest> {
  const cat = await getCatalog()
  const blocks = [r.ev.block, r.fulfilled?.block].filter((x): x is number => x != null)
  const t = await blockTimes(blocks)
  const set = cat.sets.find((s) => s.id === num(r.ev.args.setId))
  return {
    reqId: r.reqId as unknown as number, reqHash: '0x' + BigInt(r.reqId).toString(16), buyer: r.ev.args.buyer, setId: num(r.ev.args.setId), setName: set?.name,
    count: num(r.ev.args.qty), status: r.status, seedCommit: '', seed: null, txHash: r.ev.txHash, fulfillTx: r.fulfilled?.txHash ?? null,
    createdAt: iso(t.get(r.ev.block) ?? Date.now()), fulfilledAt: r.fulfilled ? iso(t.get(r.fulfilled.block) ?? Date.now()) : null,
    cards: (r.fulfilled?.args.cardIds ?? []).map((id: bigint) => cat.cards.get(num(id))).filter(Boolean) as Card[],
  }
}

async function getCardHistory(id: number) {
  const cat = await getCatalog()
  const card = cat.cards.get(id)
  if (!card) throw new Error('This card does not exist')
  const listed = new Map<number, Active>()
  for (const e of byName('Listed', 'Marketplace')) {
    listed.set(num(e.args.listingId), { listingId: num(e.args.listingId), seller: e.args.seller, ids: e.args.ids.map(num), amounts: e.args.amounts.map(num), price: e.args.price, isBundle: e.args.isBundle, block: e.block })
  }
  const sold = byName('Sold', 'Marketplace').filter((e) => listed.get(num(e.args.listingId))?.ids.includes(id)).reverse().slice(0, 50)
  const t = await blockTimes(sold.map((e) => e.block))
  return {
    card, holders: -1, // would need ERC-1155 Transfer logs; not indexed
    sales: sold.map((e) => {
      const l = listed.get(num(e.args.listingId))!
      const amount = l.isBundle ? null : l.amounts[l.ids.indexOf(id)]
      return {
        txHash: e.txHash, block: e.block, at: iso(t.get(e.block) ?? Date.now()), isBundle: l.isBundle, buyer: e.args.buyer, seller: l.seller,
        price: formatEther(e.args.price), unitPrice: amount ? formatEther(e.args.price / BigInt(amount)) : null, amount,
      }
    }),
  }
}

async function getEvents(limit: number): Promise<ChainEvent[]> {
  const evs = allEvents().slice(-limit).reverse()
  const t = await blockTimes(evs.map((e) => e.block))
  return evs.map((e, i) => ({ id: e.block * 1000 + e.logIndex + i, contract: e.contract, name: e.name, args: plain(e.name, e.args), txHash: e.txHash, block: e.block, at: iso(t.get(e.block) ?? Date.now()) }))
}

/** Everything the connected wallet did or received: purchases, openings, listings, sales on both sides, redemptions, withdrawals. */
async function getActivity(addr: string | null, limit: number): Promise<ChainEvent[]> {
  const a = need(addr).toLowerCase()
  const cat = await getCatalog()
  const listings = new Map<number, { seller: string; ids: number[]; isBundle: boolean }>()
  for (const e of byName('Listed', 'Marketplace')) listings.set(num(e.args.listingId), { seller: String(e.args.seller).toLowerCase(), ids: e.args.ids.map(num), isBundle: e.args.isBundle })
  const reqBuyer = new Map<string, string>()
  for (const e of byName('OpenRequested', 'PackSale')) reqBuyer.set(String(e.args.reqId), String(e.args.buyer).toLowerCase())
  const is = (v: unknown) => String(v ?? '').toLowerCase() === a
  const mine = (e: Ev) => {
    const x = e.args
    switch (e.name) {
      case 'PacksPurchased': case 'OpenRequested': case 'RandomnessReady': case 'PackOpened': return is(x.buyer)
      case 'RequestCancelled': return reqBuyer.get(String(x.reqId)) === a
      case 'Listed': return is(x.seller)
      case 'Sold': return is(x.buyer) || listings.get(num(x.listingId))?.seller === a
      case 'Cancelled': return listings.get(num(x.listingId))?.seller === a
      case 'SetRedeemed': return is(x.user)
      case 'ApprovalForAll': return is(x.account)
      case 'Withdrawn': return e.contract === 'Marketplace' && is(x.to)
      default: return false
    }
  }
  const evs = allEvents().filter(mine).slice(-limit).reverse()
  const t = await blockTimes(evs.map((e) => e.block))
  const setName = (id: unknown) => cat.sets.find((s) => s.id === num(id))?.name
  const cardName = (id: unknown) => cat.cards.get(num(id))?.name
  return evs.map((e, i) => {
    const extra: Record<string, unknown> = {}
    if (e.name === 'PacksPurchased' || e.name === 'OpenRequested' || e.name === 'SetRedeemed') extra.setName = setName(e.args.setId)
    if (e.name === 'SetRedeemed') extra.cardName = cardName(e.args.rewardCardId)
    if (e.name === 'PackOpened') {
      const best = (e.args.cardIds as bigint[]).map((id) => cat.cards.get(num(id))).filter(Boolean).sort((x, y) => y!.rarity - x!.rarity)[0]
      if (best) { extra.cardName = best.name; extra.rarity = best.rarity }
    }
    if (e.name === 'Listed' || e.name === 'Sold' || e.name === 'Cancelled') {
      const l = listings.get(num(e.args.listingId))
      if (l) { extra.isBundle = l.isBundle; extra.cardName = l.isBundle ? setName(cat.cards.get(l.ids[0])?.setId) : cardName(l.ids[0]) }
      if (e.name === 'Sold') extra.side = is(e.args.buyer) ? 'buy' : 'sell'
    }
    return { id: e.block * 1000 + e.logIndex + i, contract: e.contract, name: e.name, args: { ...plain(e.name, e.args), ...extra }, txHash: e.txHash, block: e.block, at: iso(t.get(e.block) ?? Date.now()) }
  })
}

export type Pull = { reqId: string; buyer: string; setName?: string; at: string; txHash: string; cards: Card[] }
/** Most recent pack openings across all players, newest first (the "Latest pulls" strip). */
async function getPulls(limit: number): Promise<Pull[]> {
  const cat = await getCatalog()
  const setOf = new Map<string, number>()
  for (const e of byName('OpenRequested', 'PackSale')) setOf.set(String(e.args.reqId), num(e.args.setId))
  const evs = byName('PackOpened', 'PackSale').slice(-limit).reverse()
  const t = await blockTimes(evs.map((e) => e.block))
  return evs.map((e) => ({
    reqId: String(e.args.reqId), buyer: e.args.buyer, txHash: e.txHash, at: iso(t.get(e.block) ?? Date.now()),
    setName: cat.sets.find((s) => s.id === setOf.get(String(e.args.reqId)))?.name,
    cards: (e.args.cardIds as bigint[]).map((id) => cat.cards.get(num(id))).filter(Boolean) as Card[],
  }))
}

function getStats() {
  const sold = byName('Sold', 'Marketplace')
  const buyers = new Set(byName('PacksPurchased').map((e) => String(e.args.buyer).toLowerCase()))
  return {
    packsSold: byName('PacksPurchased').reduce((s, e) => s + num(e.args.qty), 0),
    sales: sold.length,
    volume: formatEther(sold.reduce((s, e) => s + (e.args.price as bigint), 0n)),
    activeListings: activeListings().length,
    wallets: buyers.size,
  }
}

// ---------- POST handlers ----------
async function post(path: string, body: any, addr: string | null, ctx?: TxCtx): Promise<any> {
  const me = need(addr)
  let m: RegExpMatchArray | null
  const W = (a: Hex, abi: readonly any[], fn: string, args: unknown[] = [], value?: bigint) => write(ctx, me, a, abi, fn, args, value)

  if (path === 'tc/packs/buy') {
    const price = (await rd<readonly [bigint, bigint, bigint, boolean]>(P, packSaleAbi, 'packConfigs', [BigInt(body.setId)]))[1]
    const qty = BigInt(body.qty)
    const { hash } = await W(P, packSaleAbi, 'buyPacks', [BigInt(body.setId), qty], price * qty)
    return { tx: hash }
  }
  if (path === 'tc/packs/open') {
    const { hash, receipt } = await W(P, packSaleAbi, 'openPacks', [BigInt(body.setId), BigInt(body.qty)])
    const log = parseEventLogs({ abi: packSaleAbi, logs: receipt.logs, eventName: 'OpenRequested' })[0]
    return { tx: hash, reqId: String(log?.args.reqId) }
  }
  if (path === 'tc/packs/claim') return { tx: (await W(P, packSaleAbi, 'claimPacks', [BigInt(body.reqId)])).hash }
  if (path === 'tc/packs/cancel') return { tx: (await W(P, packSaleAbi, 'cancelStuckRequest', [BigInt(body.reqId)])).hash }
  if (path === 'tc/approve') return { tx: (await W(C, cardCollectionAbi, 'setApprovalForAll', [M, body.approved !== false])).hash }
  if (path === 'tc/listings') {
    return { tx: (await W(M, marketplaceAbi, 'listCard', [BigInt(body.cardId), BigInt(body.amount), parseEther(String(body.price))])).hash }
  }
  if (path === 'tc/listings/bundle') return { tx: (await W(M, marketplaceAbi, 'listBundle', [BigInt(body.setId), parseEther(String(body.price))])).hash }
  if ((m = path.match(/^tc\/listings\/(\d+)\/(buy|cancel)$/))) {
    const id = BigInt(m[1])
    if (m[2] === 'cancel') return { tx: (await W(M, marketplaceAbi, 'cancel', [id])).hash }
    const l = await rd<{ price: bigint }>(M, marketplaceAbi, 'getListing', [id])
    return { tx: (await W(M, marketplaceAbi, 'buy', [id], l.price)).hash }
  }
  if (path === 'tc/withdraw') return { tx: (await W(M, marketplaceAbi, 'withdraw')).hash }
  if ((m = path.match(/^tc\/sets\/(\d+)\/redeem$/))) return { tx: (await W(C, cardCollectionAbi, 'redeemSet', [BigInt(m[1])])).hash }
  if ((m = path.match(/^tc\/sets\/(\d+)\/pack$/))) {
    const { hash } = await W(P, packSaleAbi, 'configurePack', [BigInt(m[1]), parseEther(String(body.price)), BigInt(body.supply), !!body.onSale])
    return { tx: hash }
  }
  if (path === 'tc/sets') {
    // Metadata (names, TCGdex data) is pinned separately by the Pack Builder; on chain a set is just rarities + supplies.
    const cards = body.cards as { rarity: number; maxSupply: number }[]
    const { hash, receipt } = await W(C, cardCollectionAbi, 'createSet', [String(body.name), cards.map((c) => c.rarity), cards.map((c) => BigInt(c.maxSupply)), BigInt(body.rewardMaxSupply ?? REWARD_MAX_SUPPLY)])
    const ev = parseEventLogs({ abi: cardCollectionAbi, logs: receipt.logs, eventName: 'SetCreated' })[0]
    return { tx: hash, setId: Number(ev?.args.setId), cardIds: (ev?.args.cardIds ?? []).map(Number), rewardCardId: Number(ev?.args.rewardCardId) }
  }
  if (path === 'tc/admin/baseuri') return { tx: (await W(C, cardCollectionAbi, 'setBaseURI', [String(body.uri)])).hash }
  if (path === 'tc/admin/withdraw') {
    let last: Hex | undefined
    if ((await publicClient.getBalance({ address: P })) > 0n) last = (await W(P, packSaleAbi, 'withdraw', [getAddress(me)])).hash
    if ((await rd<bigint>(M, marketplaceAbi, 'accruedFees')) > 0n) last = (await W(M, marketplaceAbi, 'withdrawFees', [getAddress(me)])).hash
    if (!last) throw new Error('There is no revenue to withdraw.')
    return { tx: last }
  }
  if (path === 'tc/admin/pause') {
    let last: Hex | undefined
    for (const [addr, abi] of [[C, cardCollectionAbi], [P, packSaleAbi], [M, marketplaceAbi]] as const) {
      const cur = await rd<boolean>(addr, abi, 'paused')
      if (cur !== !!body.paused) last = (await W(addr, abi, body.paused ? 'pause' : 'unpause')).hash
    }
    if (!last) throw new Error('The contracts are already in that state.')
    return { tx: last }
  }
  if (path === 'tc/admin/fee') return { tx: (await W(M, marketplaceAbi, 'setFee', [BigInt(body.bps)])).hash }
    throw new Error(`Unsupported action: ${path}`)
}

/** What the Pack Builder needs before publishing: the ids the next set will get and the metadata of every existing token. */
async function getBuilderContext() {
  await getCatalog(true) // makes sure metadata of all existing tokens was fetched
  const [nextCardId, nextSetId, uri] = await Promise.all([
    rd<bigint>(C, cardCollectionAbi, 'nextCardId'),
    rd<bigint>(C, cardCollectionAbi, 'nextSetId'),
    rd<string>(C, cardCollectionAbi, 'uri', [1n]),
  ])
  const existing = knownRawMetadata()
  const next = num(nextCardId)
  const missing = Array.from({ length: next - 1 }, (_, i) => i + 1).filter((id) => existing[id] == null)
  return { nextCardId: next, nextSetId: num(nextSetId), currentBaseUri: uri.replace(/1\.json$/, ''), existing, missing }
}

/** personal_sign with the connected wallet (no gas) — used to authenticate /api/pin. */
export async function signMessage(addr: string, message: string): Promise<Hex> {
  try {
    await ensureChain()
    return await walletClient().signMessage({ account: getAddress(addr), message })
  } catch (e) {
    throw new Error(explain(e))
  }
}

// ---------- entry ----------
export async function chainHttp(path: string, init: Init | undefined, addr: string | null): Promise<any> {
  const url = new URL(path, 'http://x/')
  const p = url.pathname.replace(/^\//, '')
  const q = url.searchParams
  if ((init?.method || 'GET') === 'POST') return post(p, init?.json ?? {}, addr, init?.ctx)

  // These two must work even when the event-log sync fails.
  if (p === 'tc/me') return getMe(addr)
  if (p === 'tc/diagnostics') return getDiagnostics(addr)
  await sync()
  let m: RegExpMatchArray | null
  if (p === 'tc/config') return getConfig()
  if (p === 'tc/sets') return (await getCatalog()).sets
  if ((m = p.match(/^tc\/sets\/(\d+)$/))) {
    const s = (await getCatalog()).sets.find((x) => x.id === Number(m![1]))
    if (!s) throw new Error('This set does not exist')
    return s
  }
  if (p === 'tc/collection') return getCollection(addr)
  if (p === 'tc/listings') return getListings(q)
  if ((m = p.match(/^tc\/cards\/(\d+)$/))) return getCardHistory(Number(m[1]))
  if (p === 'tc/packs/requests') return Promise.all(requestsOf(need(addr)).reverse().slice(0, 15).map(toRequestView))
  if ((m = p.match(/^tc\/packs\/requests\/(\d+)$/))) {
    const r = requestsOf().find((x) => x.reqId === m![1])
    if (!r) throw new Error('Request not found')
    return toRequestView(r)
  }
  if (p === 'tc/stats') return getStats()
  if (p === 'tc/events') return getEvents(Math.min(Number(q.get('limit')) || 25, 100))
  if (p === 'tc/builder/context') return getBuilderContext()
  if (p === 'tc/activity') return getActivity(addr, Math.min(Number(q.get('limit')) || 60, 200))
  if (p === 'tc/pulls') return getPulls(Math.min(Number(q.get('limit')) || 12, 50))
  throw new Error(`Unsupported query: ${p}`)
}
