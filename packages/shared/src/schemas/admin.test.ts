import { describe, expect, it } from 'vitest'
import { adminRequestSchema } from './admin.ts'

const id = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'

describe('adminRequestSchema', () => {
  it('defaults the page and trims searches', () => {
    expect(adminRequestSchema.parse({ action: 'listUsers', search: ' ada ' })).toEqual({
      action: 'listUsers',
      search: 'ada',
      page: 0,
    })
  })

  it('validates each action', () => {
    expect(adminRequestSchema.safeParse({ action: 'deleteUser', userId: id }).success).toBe(true)
    expect(adminRequestSchema.safeParse({ action: 'deleteUser', userId: 'x' }).success).toBe(false)
    expect(
      adminRequestSchema.safeParse({ action: 'renameHousehold', householdId: id, name: ' ' })
        .success,
    ).toBe(false)
    expect(adminRequestSchema.safeParse({ action: 'dropTables' }).success).toBe(false)
  })
  it('requires a real temporary password for new admins', () => {
    const base = { action: 'addAdmin', email: 'ops@example.com', fullName: 'Ops' }
    expect(adminRequestSchema.safeParse({ ...base, password: 'short' }).success).toBe(false)
    expect(adminRequestSchema.safeParse({ ...base, password: 'long enough pw' }).success).toBe(true)
  })
})
