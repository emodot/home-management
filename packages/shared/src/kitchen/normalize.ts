/**
 * Lower case, accents dropped ("Ụgụ" → "ugu"), punctuation as spaces, single spaces. For search.
 */
export function itemSearchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Words that look plural but aren't, or whose singular the rules below get wrong. */
const SINGULAR: Record<string, string> = {
  molasses: 'molasses',
  couscous: 'couscous',
  hummus: 'hummus',
  leaves: 'leaf',
  loaves: 'loaf',
  knives: 'knife',
  cookies: 'cookie',
  pies: 'pie',
  veggies: 'veggie',
  smoothies: 'smoothie',
  brownies: 'brownie',
}

function singular(word: string): string {
  const known = SINGULAR[word]
  if (known) return known
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y` // berries → berry
  if (/(ch|sh|x|z|o)es$/.test(word)) return word.slice(0, -2) // peaches, boxes, tomatoes
  if (/(ss|us|is)$/.test(word)) return word // glass, asparagus
  if (word.endsWith('s')) return word.slice(0, -1) // eggs, onions, cubes
  return word
}

/**
 * The catalogue's matching key, so "Tomatoes ", "tomato" and "TOMATO" are one item: the search
 * key with its last word made singular ("Maggi cubes" → "maggi cube"). Empty when there's nothing
 * to match on.
 */
export function normalizeItemName(name: string): string {
  const words = itemSearchKey(name).split(' ').filter(Boolean)
  const last = words.pop()
  return last === undefined ? '' : [...words, singular(last)].join(' ')
}
