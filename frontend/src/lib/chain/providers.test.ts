import { describe, expect, it } from 'vitest'
import { parseChainId, pickWallet } from './providers'

describe('parseChainId', () => {
  it('reads CAIP-2, hex and plain ids', () => {
    expect(parseChainId('eip155:11155111')).toBe(11155111)
    expect(parseChainId('0xaa36a7')).toBe(11155111)
    expect(parseChainId(31337)).toBe(31337)
    expect(parseChainId('31337')).toBe(31337)
  })
  it('returns null for missing or garbage values', () => {
    expect(parseChainId(undefined)).toBeNull()
    expect(parseChainId('')).toBeNull()
    expect(parseChainId('eip155:abc')).toBeNull()
  })
})

describe('pickWallet', () => {
  const a = '0x84937c9A31e04f96f4eDB96d88F19c2d381BC3e3'
  const b = '0x70D37c6d44a19b78eaeA76Eb587847c9f3fe2172'
  it('takes the first (most recently connected) Ethereum wallet', () => {
    expect(pickWallet([{ address: a, type: 'ethereum' }, { address: b, type: 'ethereum' }])?.address).toBe(a)
  })
  it('skips non-Ethereum entries and malformed addresses', () => {
    expect(pickWallet([{ address: 'So1ana111', type: 'solana' }, { address: 'nope' }, { address: b }])?.address).toBe(b)
  })
  it('returns null when there is no usable wallet', () => {
    expect(pickWallet([])).toBeNull()
  })
})
