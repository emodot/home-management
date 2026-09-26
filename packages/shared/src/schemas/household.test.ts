import { describe, expect, it } from 'vitest'
import { emailSignInSchema } from './auth.ts'
import { householdNameSchema } from './household.ts'

describe('householdNameSchema', () => {
  it('trims the name', () => {
    expect(householdNameSchema.parse('  Obi home ')).toBe('Obi home')
  })

  it('rejects blank and overly long names', () => {
    expect(householdNameSchema.safeParse('   ').success).toBe(false)
    expect(householdNameSchema.safeParse('x'.repeat(81)).success).toBe(false)
    expect(householdNameSchema.safeParse('x'.repeat(80)).success).toBe(true)
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
