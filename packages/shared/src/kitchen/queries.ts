import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { escapeLike } from '../queries/expenses.ts'
import { itemSearchKey, normalizeItemName } from './normalize.ts'
import { mergeStoreTags, type ListItemSource, type ShoppingListItem } from './list.ts'
import { kitchenItemInputSchema, type KitchenItemInput, type ListItemPatch } from './schemas.ts'
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

/** One catalogue item, or null if it doesn't exist (or belongs to another household). */
export async function getKitchenItem(client: HomeClient, id: string): Promise<KitchenItem | null> {
  const row = unwrap(await client.from('kitchen_items').select('*').eq('id', id).maybeSingle())
  return row ? toKitchenItem(row) : null
}

// ---------------------------------------------------------------- shopping list

const LIST_SELECT = '*, item:kitchen_items(name)'
type ListRow = Tables<'shopping_list_items'> & { item: { name: string } | null }

export function toShoppingListItem(row: ListRow): ShoppingListItem {
  return {
    id: row.id,
    householdId: row.household_id,
    itemId: row.item_id,
    name: row.item?.name ?? '',
    // PostgREST returns numeric as a number; be safe if it comes back as text.
    quantity: typeof row.quantity === 'string' ? Number(row.quantity) : row.quantity,
    unit: isKitchenUnit(row.unit) ? row.unit : 'pcs',
    storeTag: row.store_tag,
    notes: row.notes,
    isChecked: row.is_checked,
    checkedBy: row.checked_by,
    pricePaidMinor: row.price_paid_minor,
    source: row.source as ListItemSource,
    addedBy: row.created_by,
    createdAt: row.created_at,
  }
}

/** The household's shopping list, oldest entry first. */
export async function listShoppingList(
  client: HomeClient,
  householdId: string,
): Promise<ShoppingListItem[]> {
  const rows = unwrap(
    await client
      .from('shopping_list_items')
      .select(LIST_SELECT)
      .eq('household_id', householdId)
      .order('created_at'),
  )
  return rows.map(toShoppingListItem)
}

export interface AddToListResult {
  /** `exists`: it was already on the list; `unchecked`: it was checked off and is back on. */
  status: 'added' | 'exists' | 'unchecked'
  entry: ShoppingListItem
}

/**
 * Puts a catalogue item on the list with its usual unit and store. An item is on the list only
 * once, so adding it again returns the existing entry (unchecking it if it was checked off).
 */
export async function addToShoppingList(
  client: HomeClient,
  householdId: string,
  item: KitchenItem,
  options: { quantity?: number; source?: Exclude<ListItemSource, 'meal_plan'> } = {},
): Promise<AddToListResult> {
  const { data, error } = await client
    .from('shopping_list_items')
    .insert({
      household_id: householdId,
      item_id: item.id,
      quantity: options.quantity ?? 1,
      unit: item.defaultUnit,
      store_tag: item.defaultStoreTag,
      source: options.source ?? 'manual',
    })
    .select(LIST_SELECT)
    .single()
  if (!error) return { status: 'added', entry: toShoppingListItem(data) }
  if (error.code !== '23505') throw error

  const existing = unwrap(
    await client
      .from('shopping_list_items')
      .select(LIST_SELECT)
      .eq('household_id', householdId)
      .eq('item_id', item.id)
      .single(),
  )
  if (!existing.is_checked) return { status: 'exists', entry: toShoppingListItem(existing) }
  const reopened = unwrap(
    await client
      .from('shopping_list_items')
      .update({ is_checked: false })
      .eq('id', existing.id)
      .select(LIST_SELECT)
      .single(),
  )
  return { status: 'unchecked', entry: toShoppingListItem(reopened) }
}

/** Any change to an entry: its details, checking it off, or the price paid. */
export type ListEntryPatch = Partial<ListItemPatch> & {
  isChecked?: boolean
  pricePaidMinor?: number | null
}

export async function updateShoppingListItem(
  client: HomeClient,
  id: string,
  patch: ListEntryPatch,
): Promise<void> {
  unwrap(
    await client
      .from('shopping_list_items')
      .update({
        ...(patch.quantity !== undefined && { quantity: patch.quantity }),
        ...(patch.unit !== undefined && { unit: patch.unit }),
        ...(patch.storeTag !== undefined && { store_tag: patch.storeTag }),
        ...(patch.notes !== undefined && { notes: patch.notes }),
        ...(patch.isChecked !== undefined && { is_checked: patch.isChecked }),
        ...(patch.pricePaidMinor !== undefined && { price_paid_minor: patch.pricePaidMinor }),
      })
      .eq('id', id),
  )
}

export async function removeShoppingListItem(client: HomeClient, id: string): Promise<void> {
  unwrap(await client.from('shopping_list_items').delete().eq('id', id))
}

/** Undo for removeShoppingListItem: puts the entry back as it was, with the same id. */
export async function restoreShoppingListItem(
  client: HomeClient,
  entry: ShoppingListItem,
): Promise<void> {
  unwrap(
    await client.from('shopping_list_items').insert({
      id: entry.id,
      household_id: entry.householdId,
      item_id: entry.itemId,
      quantity: entry.quantity,
      unit: entry.unit,
      store_tag: entry.storeTag,
      notes: entry.notes,
      is_checked: entry.isChecked,
      price_paid_minor: entry.pricePaidMinor,
      source: entry.source,
    }),
  )
}

/** Makes a unit and store the item's defaults for next time. */
export async function setKitchenItemDefaults(
  client: HomeClient,
  itemId: string,
  defaults: { defaultUnit: KitchenUnit; defaultStoreTag: string | null },
): Promise<void> {
  unwrap(
    await client
      .from('kitchen_items')
      .update({ default_unit: defaults.defaultUnit, default_store_tag: defaults.defaultStoreTag })
      .eq('id', itemId),
  )
}

/** Stores the household buys from, most recently used first. */
export async function recentStoreTags(client: HomeClient, householdId: string): Promise<string[]> {
  const rows = unwrap(
    await client
      .from('kitchen_items')
      .select('default_store_tag')
      .eq('household_id', householdId)
      .not('default_store_tag', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(50),
  )
  return mergeStoreTags([rows.map((r) => r.default_store_tag)])
}
