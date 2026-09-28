import { categoryTree, type Category } from '@home/shared'
import { CategoryIcon } from '@/components/category-icon'
import { SelectItem } from '@/components/ui/select'

/**
 * The items of a category <Select>: top-level categories with their sub-categories indented
 * underneath. A chosen sub-category reads "Parent › Sub" in the closed select (the parent prefix is
 * only shown there, not in the list).
 */
export function CategoryOptions({
  categories,
  icons = false,
  markArchived = false,
}: {
  /** In display order; already filtered to the ones to offer. */
  categories: Category[]
  icons?: boolean
  /** Adds "(archived)" (for filters, where old categories stay selectable). */
  markArchived?: boolean
}) {
  const label = (c: Category) => (markArchived && c.is_archived ? `${c.name} (archived)` : c.name)
  return categoryTree(categories).flatMap(({ category, children }) => [
    <SelectItem key={category.id} value={category.id}>
      {icons && <CategoryIcon icon={category.icon} className="size-6 bg-transparent" />}
      {label(category)}
    </SelectItem>,
    ...children.map((child) => (
      <SelectItem key={child.id} value={child.id} className="pl-8">
        {icons && <CategoryIcon icon={child.icon} className="size-6 bg-transparent" />}
        <span>
          <span className="hidden in-data-[slot=select-value]:inline">{category.name} › </span>
          {label(child)}
        </span>
      </SelectItem>
    )),
  ])
}
