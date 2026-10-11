import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { escapeLike } from '../queries/expenses.ts'
import { itemSearchKey, normalizeItemName } from './normalize.ts'
import { kitchenItemInputSchema, type KitchenItemInput } from './schemas.ts'
import { isKitchenUnit, type KitchenUnit } from './units.ts'

export interface KitchenItem {
  id: string
  householdId: string
  name: string
  normalizedName: string
  defaultUnit: KitchenUnit
  defaultStoreTag: string | null
}

export function toKitchenItem(row: Tables<'kitchen_items'>): KitchenItem {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    normalizedName: row.normalized_name,
    defaultUnit: isKitchenUnit(row.default_unit) ? row.default_unit : 'pcs',
    defaultStoreTag: row.default_store_tag,
  }
}

const SEARCH_FETCH = 30

/**
 * Catalogue items matching what's been typed, best first: exact item, then names starting with
 * it, then the rest alphabetically. With nothing typed, the most recently used items.
 */
export async function searchKitchenItems(
  client: HomeClient,
  householdId: string,
  search: string,
  limit = 8,
): Promise<KitchenItem[]> {
  const loose = itemSearchKey(search)
  const key = normalizeItemName(search)
  let query = client.from('kitchen_items').select('*').eq('household_id', householdId)
  if (loose) {
    // Both forms only hold letters, digits and spaces, so they're safe inside or().
    const terms = [...new Set([loose, key])].map((t) => `normalized_name.ilike.%${escapeLike(t)}%`)
    query = query.or(terms.join(','))
  }
  const rows = unwrap(await query.order('updated_at', { ascending: false }).limit(SEARCH_FETCH))
  const items = rows.map(toKitchenItem)
  if (!loose) return items.slice(0, limit)

  const rank = (item: KitchenItem) =>
    item.normalizedName === key
      ? 0
      : item.normalizedName.startsWith(loose) || item.normalizedName.startsWith(key)
        ? 1
        : 2
  return items
    .sort((a, b) => rank(a) - rank(b) || a.normalizedName.localeCompare(b.normalizedName))
    .slice(0, limit)
}

/**
 * Adds an item to the catalogue, or returns the existing one with the same matching key (also
 * when someone else added it a moment ago).
 */
export async function createKitchenItem(
  client: HomeClient,
  householdId: string,
  input: KitchenItemInput,
): Promise<KitchenItem> {
  const parsed = kitchenItemInputSchema.parse(input)
  const normalizedName = normalizeItemName(parsed.name)
  const { data, error } = await client
    .from('kitchen_items')
    .insert({
      household_id: householdId,
      name: parsed.name,
      normalized_name: normalizedName,
      default_unit: parsed.defaultUnit,
      default_store_tag: parsed.defaultStoreTag,
    })
    .select('*')
    .single()
  if (!error) return toKitchenItem(data)
  if (error.code !== '23505') throw error
  const existing = unwrap(
    await client
      .from('kitchen_items')
      .select('*')
      .eq('household_id', householdId)
      .eq('normalized_name', normalizedName)
      .single(),
  )
  return toKitchenItem(existing)
}
