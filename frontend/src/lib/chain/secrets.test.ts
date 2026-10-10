import { describe, expect, it } from 'vitest'
import { commitmentOf, newSecret } from './secrets'

describe('pack secrets', () => {
  it('commitment matches PackSale: keccak256(abi.encode(secret, buyer)) — vector computed with ethers', () => {
    const secret = `0x${'11'.repeat(32)}` as const
    expect(commitmentOf(secret, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'))
      .toBe('0x36fdd6f76f1327a934b42fa4d34efce4fe38d6307d549b0f351164e22cf8adfa')
  })
  it('new secrets are random 32-byte hex values', () => {
    const a = newSecret(), b = newSecret()
    expect(a).toMatch(/^0x[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})
