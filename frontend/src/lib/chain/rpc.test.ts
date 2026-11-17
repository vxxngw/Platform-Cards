import { describe, expect, it } from 'vitest'
import { maskRpc } from './config'
import { rangeLimitError } from './events'

describe('maskRpc', () => {
  it('hides Alchemy and Infura keys and leaves keyless URLs alone', () => {
    expect(maskRpc('https://eth-sepolia.g.alchemy.com/v2/abc123')).toBe('https://eth-sepolia.g.alchemy.com/v2/…')
    expect(maskRpc('https://sepolia.infura.io/v3/deadbeef')).toBe('https://sepolia.infura.io/v3/…')
    expect(maskRpc('https://ethereum-sepolia-rpc.publicnode.com')).toBe('https://ethereum-sepolia-rpc.publicnode.com')
  })
})

describe('rangeLimitError', () => {
  it('turns an Alchemy free-tier range refusal into a fix-it message without the key', () => {
    const e = rangeLimitError(new Error('Details: Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.')) as Error
    expect(e.message).toMatch(/VITE_LOGS_RPC_URL/)
    expect(e.message).toMatch(/publicnode/)
  })
  it('passes other errors through unchanged', () => {
    const original = new Error('fetch failed')
    expect(rangeLimitError(original)).toBe(original)
  })
})
