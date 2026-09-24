import { describe, expect, it } from 'vitest'
import { toActivityEntry } from './activity.ts'

const row = {
  id: 7,
  household_id: 'h1',
  actor_id: null,
  entity_type: 'receipt',
  entity_id: 'r1',
  action: 'created',
  summary: 'added receipt r.jpg',
  changes: { label: 'Water tanker', expense_id: 'e1', file_name: 'r.jpg' },
  created_at: '2026-09-24T10:00:00Z',
}

describe('toActivityEntry', () => {
  it('lifts the label and expense id out of changes', () => {
    expect(toActivityEntry(row)).toMatchObject({
      id: 7,
      entityType: 'receipt',
      label: 'Water tanker',
      expenseId: 'e1',
      actorId: null,
    })
  })

  it('tolerates missing or odd changes', () => {
    expect(toActivityEntry({ ...row, changes: null })).toMatchObject({
      label: null,
      expenseId: null,
    })
    expect(toActivityEntry({ ...row, changes: { label: 3 } })).toMatchObject({ label: null })
    expect(toActivityEntry({ ...row, changes: ['x'] })).toMatchObject({ label: null })
  })
})
