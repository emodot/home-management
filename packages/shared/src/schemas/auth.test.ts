import { describe, expect, it } from 'vitest'
import {
  changePasswordSchema,
  newPasswordSchema,
  passwordSignInSchema,
  signUpSchema,
} from './auth.ts'

describe('signUpSchema', () => {
  it('normalises the email and requires 8–72 character passwords', () => {
    expect(signUpSchema.parse({ email: ' Ada@Example.com', password: 'correct horse' })).toEqual({
      email: 'ada@example.com',
      password: 'correct horse',
    })
    expect(signUpSchema.safeParse({ email: 'ada@example.com', password: 'short' }).success).toBe(
      false,
    )
    expect(
      signUpSchema.safeParse({ email: 'ada@example.com', password: 'x'.repeat(73) }).success,
    ).toBe(false)
  })
})

describe('passwordSignInSchema', () => {
  it('only requires a password to be entered', () => {
    expect(
      passwordSignInSchema.safeParse({ email: 'ada@example.com', password: 'x' }).success,
    ).toBe(true)
    expect(passwordSignInSchema.safeParse({ email: 'ada@example.com', password: '' }).success).toBe(
      false,
    )
  })
})

describe('newPasswordSchema', () => {
  it('requires both entries to match', () => {
    const result = newPasswordSchema.safeParse({
      password: 'correct horse',
      confirm: 'correct hors',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['confirm'])
    expect(
      newPasswordSchema.safeParse({ password: 'correct horse', confirm: 'correct horse' }).success,
    ).toBe(true)
  })
})

describe('changePasswordSchema', () => {
  const valid = { current: 'old password', password: 'correct horse', confirm: 'correct horse' }

  it('needs the current password, a matching confirmation and a new password', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
    expect(changePasswordSchema.safeParse({ ...valid, current: '' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ ...valid, confirm: 'nope' }).success).toBe(false)
    const same = changePasswordSchema.safeParse({
      current: 'correct horse',
      password: 'correct horse',
      confirm: 'correct horse',
    })
    expect(same.error?.issues[0]?.path).toEqual(['password'])
  })
})
