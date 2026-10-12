import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { escapeLike } from '../queries/expenses.ts'
import { itemSearchKey, normalizeItemName } from './normalize.ts'
import { mergeStoreTags, type ListItemSource, type ShoppingListItem } from './list.ts'
import { isPantryLocation, type PantryItem, type PantryLocation } from './pantry.ts'
import type { PricePoint } from './prices.ts'
import { kitchenItemInputSchema, type KitchenItemInput, type ListItemPatch } from './schemas.ts'
import { isKitchenUnit, type KitchenUnit, type UnitConversion } from './units.ts'

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

// ---------------------------------------------------------------- managing the catalogue

export interface CatalogItem extends KitchenItem {
  /** How many prices it has on record. */
  priceCount: number
}

/** Every item in the household's catalogue, A–Z, with how many prices each has. */
export async function listCatalogItems(
  client: HomeClient,
  householdId: string,
): Promise<CatalogItem[]> {
  const rows = unwrap(
    await client
      .from('kitchen_items')
      .select('*, prices:item_prices(count)')
      .eq('household_id', householdId)
      .order('name'),
  )
  return rows.map((r) => ({ ...toKitchenItem(r), priceCount: r.prices[0]?.count ?? 0 }))
}

/** Another item already has the name (its matching key) an item was being renamed to. */
export class DuplicateKitchenItemError extends Error {
  readonly existing: KitchenItem

  constructor(existing: KitchenItem) {
    super(`There's already an item called ${existing.name}.`)
    this.name = 'DuplicateKitchenItemError'
    this.existing = existing
  }
}

/**
 * Renames an item and sets its defaults. When another item already has that name, throws a
 * DuplicateKitchenItemError carrying it (so the two can be merged instead).
 */
export async function updateKitchenItem(
  client: HomeClient,
  item: Pick<KitchenItem, 'id' | 'householdId'>,
  input: KitchenItemInput,
): Promise<KitchenItem> {
  const parsed = kitchenItemInputSchema.parse(input)
  const normalizedName = normalizeItemName(parsed.name)
  const { data, error } = await client
    .from('kitchen_items')
    .update({
      name: parsed.name,
      normalized_name: normalizedName,
      default_unit: parsed.defaultUnit,
      default_store_tag: parsed.defaultStoreTag,
    })
    .eq('id', item.id)
    .select('*')
    .single()
  if (!error) return toKitchenItem(data)
  if (error.code !== '23505') throw error
  const existing = unwrap(
    await client
      .from('kitchen_items')
      .select('*')
      .eq('household_id', item.householdId)
      .eq('normalized_name', normalizedName)
      .single(),
  )
  throw new DuplicateKitchenItemError(toKitchenItem(existing))
}

export interface ItemConversion extends UnitConversion {
  id: string
  itemId: string
}

/** How the household's items' units relate ("1 bag = 50 kg"), in the order they were added. */
export async function listKitchenConversions(
  client: HomeClient,
  householdId: string,
): Promise<ItemConversion[]> {
  const rows = unwrap(
    await client
      .from('kitchen_item_units')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at'),
  )
  return rows.flatMap((r) =>
    isKitchenUnit(r.unit) && isKitchenUnit(r.to_unit)
      ? [
          {
            id: r.id,
            itemId: r.item_id,
            unit: r.unit,
            factor: typeof r.factor === 'string' ? Number(r.factor) : r.factor,
            toUnit: r.to_unit,
          },
        ]
      : [],
  )
}

export async function addItemConversion(
  client: HomeClient,
  item: Pick<KitchenItem, 'id' | 'householdId'>,
  conversion: UnitConversion,
): Promise<void> {
  unwrap(
    await client.from('kitchen_item_units').insert({
      household_id: item.householdId,
      item_id: item.id,
      unit: conversion.unit,
      factor: conversion.factor,
      to_unit: conversion.toUnit,
    }),
  )
}

export async function removeItemConversion(client: HomeClient, id: string): Promise<void> {
  unwrap(await client.from('kitchen_item_units').delete().eq('id', id))
}

/**
 * Folds `mergeId` into `keepId` and deletes it: its prices, conversions, list entry and pantry
 * stock move to the kept item (quantities added where the units convert).
 */
export async function mergeKitchenItems(
  client: HomeClient,
  keepId: string,
  mergeId: string,
): Promise<void> {
  unwrap(await client.rpc('merge_kitchen_items', { p_keep: keepId, p_merge: mergeId }))
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
  options: {
    quantity?: number
    source?: Exclude<ListItemSource, 'meal_plan'>
    /** Uncheck it if it's checked off (in someone's basket). Off for "running low". */
    reopen?: boolean
  } = {},
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
  if (!existing.is_checked || options.reopen === false) {
    return { status: 'exists', entry: toShoppingListItem(existing) }
  }
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

// ---------------------------------------------------------------- pantry

const PANTRY_SELECT = '*, item:kitchen_items(*)'
type PantryRow = Tables<'pantry_items'> & { item: Tables<'kitchen_items'> | null }

export function toPantryItem(row: PantryRow): PantryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    itemId: row.item_id,
    name: row.item?.name ?? '',
    catalogItem: row.item
      ? toKitchenItem(row.item)
      : {
          id: row.item_id,
          householdId: row.household_id,
          name: '',
          normalizedName: '',
          defaultUnit: 'pcs',
          defaultStoreTag: null,
        },
    quantity: typeof row.quantity === 'string' ? Number(row.quantity) : row.quantity,
    unit: isKitchenUnit(row.unit) ? row.unit : 'pcs',
    location: isPantryLocation(row.location) ? row.location : 'pantry',
    expiresOn: row.expires_on,
    lowStockThreshold:
      typeof row.low_stock_threshold === 'string'
        ? Number(row.low_stock_threshold)
        : row.low_stock_threshold,
    updatedAt: row.updated_at,
  }
}

/** Everything in the household's kitchen. */
export async function listPantry(client: HomeClient, householdId: string): Promise<PantryItem[]> {
  const rows = unwrap(
    await client.from('pantry_items').select(PANTRY_SELECT).eq('household_id', householdId),
  )
  return rows.map(toPantryItem).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Starts tracking a catalogue item in the pantry (one of its usual unit). Returns the existing
 * entry if it's already tracked.
 */
export async function addToPantry(
  client: HomeClient,
  householdId: string,
  item: KitchenItem,
  location: PantryLocation = 'pantry',
): Promise<{ status: 'added' | 'exists'; item: PantryItem }> {
  const { data, error } = await client
    .from('pantry_items')
    .insert({
      household_id: householdId,
      item_id: item.id,
      quantity: 1,
      unit: item.defaultUnit,
      location,
    })
    .select(PANTRY_SELECT)
    .single()
  if (!error) return { status: 'added', item: toPantryItem(data) }
  if (error.code !== '23505') throw error
  const existing = unwrap(
    await client
      .from('pantry_items')
      .select(PANTRY_SELECT)
      .eq('household_id', householdId)
      .eq('item_id', item.id)
      .single(),
  )
  return { status: 'exists', item: toPantryItem(existing) }
}

export interface PantryPatch {
  quantity?: number
  unit?: KitchenUnit
  location?: PantryLocation
  expiresOn?: string | null
  lowStockThreshold?: number | null
}

export async function updatePantryItem(
  client: HomeClient,
  id: string,
  patch: PantryPatch,
): Promise<void> {
  unwrap(
    await client
      .from('pantry_items')
      .update({
        ...(patch.quantity !== undefined && { quantity: patch.quantity }),
        ...(patch.unit !== undefined && { unit: patch.unit }),
        ...(patch.location !== undefined && { location: patch.location }),
        ...(patch.expiresOn !== undefined && { expires_on: patch.expiresOn }),
        ...(patch.lowStockThreshold !== undefined && {
          low_stock_threshold: patch.lowStockThreshold,
        }),
      })
      .eq('id', id),
  )
}

export async function removePantryItem(client: HomeClient, id: string): Promise<void> {
  unwrap(await client.from('pantry_items').delete().eq('id', id))
}

/** Undo for removePantryItem: puts it back as it was, with the same id. */
export async function restorePantryItem(client: HomeClient, item: PantryItem): Promise<void> {
  unwrap(
    await client.from('pantry_items').insert({
      id: item.id,
      household_id: item.householdId,
      item_id: item.itemId,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expires_on: item.expiresOn,
      low_stock_threshold: item.lowStockThreshold,
    }),
  )
}

export interface ItemPrice {
  id: string
  boughtOn: string
  quantity: number
  unit: KitchenUnit
  priceMinor: number
  unitPriceMinor: number
  storeTag: string | null
}

/** What an item has cost, most recent first. */
export async function listItemPrices(
  client: HomeClient,
  itemId: string,
  limit = 50,
): Promise<ItemPrice[]> {
  const rows = unwrap(
    await client
      .from('item_prices')
      .select('*')
      .eq('item_id', itemId)
      .order('bought_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return rows.map((r) => ({
    id: r.id,
    boughtOn: r.bought_on,
    quantity: typeof r.quantity === 'string' ? Number(r.quantity) : r.quantity,
    unit: isKitchenUnit(r.unit) ? r.unit : 'pcs',
    priceMinor: r.price_minor,
    unitPriceMinor: r.unit_price_minor,
    storeTag: r.store_tag,
  }))
}

/** Every purchase with a price, for the price tracker (most recent first). */
export async function listHouseholdPrices(
  client: HomeClient,
  householdId: string,
  limit = 2000,
): Promise<PricePoint[]> {
  const rows = unwrap(
    await client
      .from('item_prices')
      .select('*, item:kitchen_items(name)')
      .eq('household_id', householdId)
      .order('bought_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    name: r.item.name,
    boughtOn: r.bought_on,
    quantity: typeof r.quantity === 'string' ? Number(r.quantity) : r.quantity,
    unit: isKitchenUnit(r.unit) ? r.unit : 'pcs',
    priceMinor: r.price_minor,
    unitPriceMinor: r.unit_price_minor,
    storeTag: r.store_tag,
    createdAt: r.created_at,
  }))
}
