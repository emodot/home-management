/** A receipt being reviewed in a batch, as far as it has been filled in. */
export interface BatchEntry {
  amountMinor: number | null
  occurredOn: string | null
}

/** What a batch entry probably duplicates: a logged expense, or an earlier entry in the batch. */
export type DuplicateOf<T> = { kind: 'existing'; expense: T } | { kind: 'batch'; index: number }

/**
 * For each entry, the first logged expense or earlier entry with the same amount and date (the
 * first of two matching entries isn't flagged, only the later one). Null when there's no match or
 * the entry has no amount or date yet.
 */
export function batchDuplicates<T extends { amountMinor: number; occurredOn: string }>(
  entries: BatchEntry[],
  existing: T[],
): (DuplicateOf<T> | null)[] {
  const seen = new Map<string, number>()
  return entries.map((entry, index) => {
    if (entry.amountMinor === null || entry.occurredOn === null) return null
    const key = `${entry.amountMinor}|${entry.occurredOn}`
    const expense = existing.find(
      (e) => e.amountMinor === entry.amountMinor && e.occurredOn === entry.occurredOn,
    )
    if (expense) return { kind: 'existing', expense }
    const earlier = seen.get(key)
    if (earlier !== undefined) return { kind: 'batch', index: earlier }
    seen.set(key, index)
    return null
  })
}
