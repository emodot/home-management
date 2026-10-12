import { normalizeItemName } from './normalize.ts'

interface Named {
  id: string
  name: string
  normalizedName: string
}

/** Every word made singular, in order: "rice (ofada)" and "Ofada rice" both give "ofada rice". */
function wordKey(item: Named): string {
  return item.normalizedName
    .split(' ')
    .map((word) => normalizeItemName(word))
    .sort()
    .join(' ')
}

/** Edits (insert, delete, change a letter) to turn `a` into `b`, giving up past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length] ?? max + 1
}

/** Names this short differ by one letter too easily (rice, mice) to call them a typo. */
const TYPO_MIN_LENGTH = 6

/**
 * Pairs of items that are probably the same thing, for tidying the catalogue: the same words in
 * another order ("Rice (ofada)", "Ofada rice") or a one-letter typo ("Tomatoe paste", "Tomato
 * paste"). Each pair once, A–Z.
 */
export function likelyDuplicates<T extends Named>(items: readonly T[]): [T, T][] {
  const pairs: [T, T][] = []
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name))
  const keys = sorted.map(wordKey)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]
      const b = sorted[j]
      const ka = keys[i]
      const kb = keys[j]
      if (!a || !b || ka === undefined || kb === undefined) continue
      const typo =
        Math.min(a.normalizedName.length, b.normalizedName.length) >= TYPO_MIN_LENGTH &&
        editDistance(a.normalizedName, b.normalizedName, 1) <= 1
      if (ka === kb || typo) pairs.push([a, b])
    }
  }
  return pairs
}
