import { z } from 'zod'
import { unwrap, type HomeClient } from '../client.ts'
import type { Json, Tables } from '../database.types.ts'

export const ACTIVITY_PAGE_SIZE = 30

export type ActivityEntityType = 'expense' | 'receipt' | 'provider' | 'task' | 'member' | 'invite'
export type ActivityAction =
  'created' | 'updated' | 'deleted' | 'restored' | 'completed' | 'joined' | 'left'

export interface ActivityEntry {
  id: number
  householdId: string
  /** Null for changes made by the daily job (e.g. generated recurring bills). */
  actorId: string | null
  entityType: ActivityEntityType
  entityId: string
  action: ActivityAction
  /** What happened, without the actor: "edited amount ₦45,000 → ₦54,000". */
  summary: string
  /** The item's name when it happened (expense description, task title, …). */
  label: string | null
  /** For receipts: the expense they belong to. */
  expenseId: string | null
  createdAt: string
}

export interface ActivityPage {
  entries: ActivityEntry[]
  /** Pass as `before` to load the next (older) page; null when there is nothing older. */
  nextCursor: number | null
}

function stringField(changes: Json | null, key: string): string | null {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return null
  const value = changes[key]
  return typeof value === 'string' ? value : null
}

export function toActivityEntry(row: Tables<'activity_log'>): ActivityEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    actorId: row.actor_id,
    entityType: row.entity_type as ActivityEntityType,
    entityId: row.entity_id,
    action: row.action as ActivityAction,
    summary: row.summary,
    label: stringField(row.changes, 'label'),
    expenseId: stringField(row.changes, 'expense_id'),
    createdAt: row.created_at,
  }
}

/** The household's activity, newest first, a page at a time. */
export async function listActivity(
  client: HomeClient,
  householdId: string,
  options: { before?: number | null; limit?: number } = {},
): Promise<ActivityPage> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE
  let query = client
    .from('activity_log')
    .select('*')
    .eq('household_id', householdId)
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (options.before != null) query = query.lt('id', options.before)
  const rows = unwrap(await query)
  const entries = rows.slice(0, limit).map(toActivityEntry)
  return {
    entries,
    nextCursor: rows.length > limit ? (entries.at(-1)?.id ?? null) : null,
  }
}

export const ITEM_HISTORY_LIMIT = 100

/**
 * One item's history, newest first. An expense's history includes its receipts.
 * Capped at ITEM_HISTORY_LIMIT entries.
 */
export async function listItemHistory(
  client: HomeClient,
  entityType: 'expense' | 'provider' | 'task',
  entityId: string,
): Promise<ActivityEntry[]> {
  // The id goes into a PostgREST filter string, so it must be exactly a uuid.
  const id = z.guid().parse(entityId)
  const base = client.from('activity_log').select('*')
  const filtered =
    entityType === 'expense'
      ? base.or(`entity_id.eq.${id},and(entity_type.eq.receipt,changes->>expense_id.eq.${id})`)
      : base.eq('entity_id', id)
  const rows = unwrap(await filtered.order('id', { ascending: false }).limit(ITEM_HISTORY_LIMIT))
  return rows.map(toActivityEntry)
}
