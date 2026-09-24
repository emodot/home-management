import { describe, expect, it } from 'vitest'
import { emailSignInSchema } from './auth'
import { createHouseholdSchema, onboardingSchema } from './household'

describe('createHouseholdSchema', () => {
  it('trims the name', () => {
    expect(createHouseholdSchema.parse({ name: '  Obi home ' })).toEqual({ name: 'Obi home' })
  })

  it('rejects blank and overly long names', () => {
    expect(createHouseholdSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createHouseholdSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
    expect(createHouseholdSchema.safeParse({ name: 'x'.repeat(80) }).success).toBe(true)
  })
})

describe('onboardingSchema', () => {
  it('requires both names', () => {
    const result = onboardingSchema.safeParse({ fullName: '', householdName: '' })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(['fullName', 'householdName'])
  })
})

describe('emailSignInSchema', () => {
  it('normalises the email', () => {
    expect(emailSignInSchema.parse({ email: '  Ada@Example.COM ' })).toEqual({
      email: 'ada@example.com',
    })
  })

  it('rejects invalid emails', () => {
    expect(emailSignInSchema.safeParse({ email: 'ada@' }).success).toBe(false)
  })
})
