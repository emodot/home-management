import { describe, expect, it } from 'vitest'
import { acceptInviteSchema, leaveHouseholdSchema, sendInviteSchema } from './invites.ts'

const householdId = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'
const token = 'Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE'

describe('sendInviteSchema', () => {
  it('normalises the email', () => {
    expect(sendInviteSchema.parse({ householdId, email: ' Bola@Example.com' })).toEqual({
      householdId,
      email: 'bola@example.com',
    })
  })

  it('allows a link without an email, or a new link for an existing invite', () => {
    expect(sendInviteSchema.parse({ householdId })).toEqual({ householdId })
    const inviteId = '5b1f0c7e-2d3a-4e5f-8a9b-0c1d2e3f4a5b'
    expect(sendInviteSchema.parse({ householdId, inviteId })).toEqual({ householdId, inviteId })
    expect(sendInviteSchema.safeParse({ householdId, inviteId, email: 'a@b.co' }).success).toBe(
      false,
    )
  })

  it('rejects a bad household id', () => {
    expect(sendInviteSchema.safeParse({ householdId: 'x', email: 'a@b.co' }).success).toBe(false)
  })
})

describe('acceptInviteSchema', () => {
  it('accepts a 43-character base64url token and defaults preview to false', () => {
    expect(token).toHaveLength(43)
    expect(acceptInviteSchema.parse({ token })).toEqual({ token, preview: false })
  })

  it.each(['', 'short', `${token}x`, token.replace('Z', '+')])('rejects %j', (bad) => {
    expect(acceptInviteSchema.safeParse({ token: bad }).success).toBe(false)
  })
})

describe('leaveHouseholdSchema', () => {
  it('only needs the household', () => {
    expect(leaveHouseholdSchema.parse({ householdId, deleteIfLast: true })).toEqual({ householdId })
  })
})
