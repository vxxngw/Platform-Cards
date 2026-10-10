import { encodeAbiParameters, keccak256, toHex, type Hex } from 'viem'
import { ADDR, CHAIN_ID } from './config'

// Commit-reveal secrets of pack openings (PackSale.openPacks / revealPacks). A secret exists only in this browser's
// localStorage until it is revealed on chain; it is saved before the commit is sent, so a closed tab never loses it.
// Lost anyway (other browser, cleared storage)? After the 256-block reveal window, expireRequest returns the packs.

/** Same formula as PackSale: keccak256(abi.encode(secret, buyer)). */
export function commitmentOf(secret: Hex, buyer: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }], [secret, buyer]))
}

export function newSecret(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

// Keyed by chain + PackSale + commitment: a chain reset redeploys PackSale at the same address, but commitments never repeat.
const key = (commitment: Hex) => `cardra.packSecret.${CHAIN_ID}.${ADDR.packSale.toLowerCase()}.${commitment.toLowerCase()}`

export function saveSecret(commitment: Hex, secret: Hex) {
  try { localStorage.setItem(key(commitment), secret) } catch { /* private mode: the request can still expire and refund */ }
}
export function loadSecret(commitment: Hex): Hex | null {
  try { return localStorage.getItem(key(commitment)) as Hex | null } catch { return null }
}
export function forgetSecret(commitment: Hex) {
  try { localStorage.removeItem(key(commitment)) } catch { /* nothing to do */ }
}
