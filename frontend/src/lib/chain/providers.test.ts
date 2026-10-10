import { describe, expect, it } from 'vitest'
import { pickProvider, type AnnouncedProvider } from './providers'

const p = (name: string) => ({ name, request: async () => null }) as any
const ann = (name: string, rdns: string): AnnouncedProvider => ({ info: { name, rdns }, provider: p(name) })

describe('pickProvider', () => {
  it('prefers MetaMask over every other announced wallet', () => {
    const mm = ann('MetaMask', 'io.metamask')
    expect(pickProvider([ann('Rabby', 'io.rabby'), mm], null)).toBe(mm.provider)
  })
  it('uses another announced wallet when MetaMask is not installed', () => {
    const rabby = ann('Rabby', 'io.rabby')
    expect(pickProvider([rabby], null)).toBe(rabby.provider)
  })
  it('finds MetaMask inside window.ethereum.providers when several wallets share the slot', () => {
    const mm = { isMetaMask: true, request: async () => null } as any
    const other = { request: async () => null } as any
    expect(pickProvider([], { providers: [other, mm] } as any)).toBe(mm)
  })
  it('falls back to a plain window.ethereum', () => {
    const eth = { request: async () => null } as any
    expect(pickProvider([], eth)).toBe(eth)
  })
  it('returns null when there is no wallet', () => {
    expect(pickProvider([], undefined)).toBeNull()
  })
})
