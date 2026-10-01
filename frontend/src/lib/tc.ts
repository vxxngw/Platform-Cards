import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { api } from './api'
import { CHAIN_MODE, txUrl } from './chain/config'
import { chainHttp, type TxCtx } from './chain/adapter'

export { CHAIN_MODE }

// ---------- types ----------
/** Reference-price lookup key. v2 (from IPFS metadata): set_name + item_no (+ variation, language, card_name); demo mode: q. */
export type PriceRef = { set_name?: string; item_no?: string; variation?: string; language?: string; card_name?: string; game?: string; q?: string }
export type Card = {
  id: number; setId: number; name: string; rarity: number; rarityName: string
  maxSupply: number; supply: number; minted: number; burned: number; cardNo: number; hue: number
  isReward: boolean; priceRef: PriceRef | null
  /** v2 (TCGdex snapshot in the token metadata). Absent in demo mode and for v1 cards, which fall back to generated art. */
  image?: string | null; setName?: string; localId?: string; officialRarity?: string; tcgdexId?: string; lang?: string
}
export type OwnedCard = Card & { balance: number; listed: number }
export type PackInfo = { price: string; remaining: number; total: number; onSale: boolean } | null
export type CardSet = { id: number; name: string; description: string | null; rewardCardId: number; baseUri: string; pack: PackInfo; cards: Card[]; source?: { setName: string; tcgdexSetId?: string; lang?: string } }
export type Wallet = { address: string; label: string | null; isAdmin: boolean; marketApproved: boolean; balance: string; pending: string }
export type Me = { wallet: Wallet | null; unopened?: { setId: number; name: string; count: number }[]; pendingRequests?: (number | string)[] }
export type Config = { adminAddress: string; paused: boolean; feeBps: number; packRevenue: string; marketFees: string; maxPacksPerTx: number }
export type OpenRequest = {
  reqId: number | string; reqHash: string; buyer: string; setId: number; setName?: string; count: number; status: string
  seedCommit: string; seed: string | null; txHash: string; fulfillTx: string | null; createdAt: string; fulfilledAt: string | null; cards: Card[]
}
export type Listing = {
  listingId: number; seller: string; isBundle: boolean; setId: number; setName: string; price: string; priceWei: string; createdAt: string
  items: { card?: Card; amount: number }[]
}
export type CollectionSet = { id: number; name: string; total: number; owned: number; complete: boolean; cards: OwnedCard[] }
export type ChainEvent = { id: number; contract: string; name: string; args: Record<string, unknown>; txHash: string; block: number; at: string }

export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary', 'Reward']
export const RARITY_VI = ['Thường', 'Hiếm', 'Sử thi', 'Huyền thoại', 'Thẻ thưởng']
export const RARITY_COLOR = ['#9ca3af', '#4c9aff', '#b26bff', '#f5b942', '#ff2882']
export const RARITY_ODDS = [60, 28, 10, 2]

// ---------- wallet store (demo wallets kept in this browser) ----------
const LS_LIST = 'tc.wallets'
const LS_CUR = 'tc.current'
const listeners = new Set<() => void>()
function read(): { list: string[]; current: string | null } {
  if (typeof window === 'undefined') return { list: [], current: null }
  try {
    return { list: JSON.parse(localStorage.getItem(LS_LIST) || '[]'), current: localStorage.getItem(LS_CUR) }
  } catch { return { list: [], current: null } }
}
let snap = read()
function commit(next: { list: string[]; current: string | null }) {
  localStorage.setItem(LS_LIST, JSON.stringify(next.list))
  if (next.current) localStorage.setItem(LS_CUR, next.current); else localStorage.removeItem(LS_CUR)
  snap = next
  listeners.forEach((l) => l())
}
export const walletStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l) },
  get: () => snap,
  select(address: string) {
    const list = snap.list.includes(address) ? snap.list : [...snap.list, address]
    commit({ list, current: address })
  },
  disconnect() { commit({ ...snap, current: null }) },
}
export function useWalletStore() {
  return useSyncExternalStore(walletStore.subscribe, walletStore.get, () => ({ list: [], current: null }))
}
export function currentAddress() { return walletStore.get().current }

// ---------- http ----------
export async function http<T>(path: string, init?: RequestInit & { json?: unknown; ctx?: TxCtx }): Promise<T> {
  const addr = currentAddress()
  // On-chain mode: `tc/*` is served straight from the contracts; `price`, `eth`, `metadata` still use the backend.
  if (CHAIN_MODE && path.startsWith('tc/')) return (await chainHttp(path, init as any, addr)) as T
  const headers: Record<string, string> = {}
  if (addr) headers['x-wallet'] = addr
  if (init?.json !== undefined) headers['content-type'] = 'application/json'
  const r = await fetch(api(path), { ...init, headers, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error || `Lỗi ${r.status}`)
  return j as T
}

// Simulated wallet transaction UX: chờ ký → đang xác nhận → thành công.
export async function sendTx<T extends { tx?: string }>(label: string, path: string, json: unknown = {}): Promise<T> {
  if (CHAIN_MODE) return sendChainTx<T>(label, path, json)
  const id = toast.loading(`${label}`, { description: 'Chờ ký giao dịch trong ví…' })
  await new Promise((r) => setTimeout(r, 450))
  toast.loading(label, { id, description: 'Đang xác nhận trên chain…' })
  try {
    const out = await http<T>(path, { method: 'POST', json })
    await new Promise((r) => setTimeout(r, 350))
    toast.success(`${label} — thành công`, { id, description: out.tx ? `tx ${short(out.tx, 10)}` : undefined })
    return out
  } catch (e) {
    toast.error(`${label} — bị revert`, { id, description: (e as Error).message })
    throw e
  }
}

// Real wallet flow: chờ ký (MetaMask) → đang xác nhận (có hash + link Etherscan) → thành công / revert.
async function sendChainTx<T extends { tx?: string }>(label: string, path: string, json: unknown): Promise<T> {
  const id = toast.loading(label, { description: 'Chờ ký giao dịch trong ví…' })
  try {
    const out = await http<T>(path, {
      method: 'POST', json,
      ctx: {
        onHash: (h) => toast.loading(label, {
          id, description: `Đang xác nhận trên chain… ${short(h, 10)}`,
          action: txUrl(h) ? { label: 'Etherscan', onClick: () => window.open(txUrl(h), '_blank') } : undefined,
        }),
      },
    })
    const u = out.tx ? txUrl(out.tx) : ''
    toast.success(`${label} — thành công`, {
      id, description: out.tx ? `tx ${short(out.tx, 10)}` : undefined,
      action: u ? { label: 'Etherscan', onClick: () => window.open(u, '_blank') } : undefined,
    })
    return out
  } catch (e) {
    toast.error(`${label} — thất bại`, { id, description: (e as Error).message })
    throw e
  }
}

// ---------- formatting ----------
export const short = (s?: string | null, n = 6) => (s ? `${s.slice(0, n)}…${s.slice(-4)}` : '—')
export function fmtEth(v: string | number, max = 4) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: max })
}
export function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 })
}
export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)} giây trước`
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`
  return `${Math.floor(s / 86400)} ngày trước`
}

// ---------- verifiable draw (same algorithm as backend & PackSale.fulfillRandomWords) ----------
async function sha256Big(s: string): Promise<bigint> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return BigInt('0x' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''))
}
export async function sha256Hex(s: string) {
  return (await sha256Big(s)).toString(16).padStart(64, '0')
}
export async function verifyDraw(seed: string, cards: Card[], count: number) {
  const byR = [0, 1, 2, 3].map((r) => cards.filter((c) => c.rarity === r && !c.isReward).sort((a, b) => a.id - b.id))
  const out: { k: number; roll: number; rarity: number; cardId: number }[] = []
  for (let k = 0; k < count * 5; k++) {
    let r = Number((await sha256Big(`${seed}:${k}`)) % 10000n)
    if (k % 5 === 4) r = 6000 + (r % 4000)
    const rarity = r < 6000 ? 0 : r < 8800 ? 1 : r < 9800 ? 2 : 3
    const pick = await sha256Big(`${seed}:${k}:card`)
    const pool = byR[rarity]
    out.push({ k, roll: r, rarity, cardId: pool[Number(pick % BigInt(pool.length))]?.id ?? -1 })
  }
  return out
}
