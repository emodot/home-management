import { describe, expect, it } from 'vitest'
import { providerInputSchema } from './providers.ts'

const base = {
  name: ' Musa Electric ',
  trade: 'electrician',
  phone: '0803 123 4567',
  whatsapp: '',
  email: ' Musa@Example.com ',
  area: '  ',
  notes: null,
  rating: 5,
} as const

describe('providerInputSchema', () => {
  it('normalises phone numbers, email and blanks', () => {
    expect(providerInputSchema.parse(base)).toEqual({
      name: 'Musa Electric',
      trade: 'electrician',
      phone: '+2348031234567',
      whatsapp: null,
      email: 'musa@example.com',
      area: null,
      notes: null,
      rating: 5,
    })
  })

  it('explains bad phone numbers', () => {
    const result = providerInputSchema.safeParse({ ...base, whatsapp: '0803' })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['whatsapp'],
      message: 'Enter a valid phone number, like 0803 123 4567',
    })
  })

  it('rejects bad emails, trades and ratings', () => {
    expect(providerInputSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false)
    expect(providerInputSchema.safeParse({ ...base, trade: 'architect' }).success).toBe(false)
    expect(providerInputSchema.safeParse({ ...base, rating: 0 }).success).toBe(false)
  })
})
