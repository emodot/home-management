import type { ActivityEntry } from '@home/shared'

/** Where an entry's item lives, if it has a page. */
export function activityHref(entry: ActivityEntry): string | null {
  switch (entry.entityType) {
    case 'expense':
      return `/expenses/${entry.entityId}`
    case 'receipt':
      return entry.expenseId ? `/expenses/${entry.expenseId}` : null
    case 'provider':
      return `/providers/${entry.entityId}`
    case 'task':
      return `/tasks/${entry.entityId}`
    case 'member':
    case 'invite':
      return '/members'
  }
}
