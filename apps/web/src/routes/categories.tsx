import {
  categoryInputSchema,
  categoryTree,
  CATEGORY_ICONS,
  type Category,
  type CategoryIcon as CategoryIconName,
} from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CornerLeftUpIcon,
  EllipsisIcon,
  FolderInputIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { CategoryIconPicker } from '@/components/category-icon-picker'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useCreateCategory, useReorderCategories, useUpdateCategory } from '@/hooks/use-categories'
import { useActiveHousehold } from '@/hooks/use-household'
import { categoriesQuery } from '@/lib/queries'

const asIcon = (icon: string): CategoryIconName =>
  (CATEGORY_ICONS as readonly string[]).includes(icon) ? (icon as CategoryIconName) : 'circle'

function CategoryEditor({
  initialName,
  initialIcon,
  submitLabel,
  placeholder = 'Category name',
  onSubmit,
  onCancel,
}: {
  initialName: string
  initialIcon: CategoryIconName
  submitLabel: string
  placeholder?: string
  onSubmit: (input: { name: string; icon: CategoryIconName }) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState(initialIcon)

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = categoryInputSchema.safeParse({ name, icon })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message)
      return
    }
    onSubmit(parsed.data)
    if (!onCancel) {
      setName('')
      setIcon('circle')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 items-center gap-2">
      <CategoryIconPicker value={icon} onChange={setIcon} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={!!onCancel}
        maxLength={40}
      />
      <Button type="submit" size={onCancel ? 'icon' : 'default'} aria-label={submitLabel}>
        {onCancel ? <CheckIcon aria-hidden /> : <PlusIcon aria-hidden />}
        {!onCancel && submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
          <XIcon aria-hidden />
        </Button>
      )}
    </form>
  )
}

export function CategoriesPage() {
  const household = useActiveHousehold()
  const categories = useSuspenseQuery(categoriesQuery(household.id)).data
  const create = useCreateCategory(household.id)
  const update = useUpdateCategory(household.id)
  const reorder = useReorderCategories(household.id)
  const [editing, setEditing] = useState<string | null>(null)
  // The category a sub-category is being added to.
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const tree = categoryTree(categories)
  const active = tree
    .filter((n) => !n.category.is_archived)
    .map((n) => ({ ...n, children: n.children.filter((c) => !c.is_archived) }))
  const topLevel = active.map((n) => n.category)
  // Archived: whole archived categories (with their subs), and archived subs of active ones.
  const archivedTop = tree.filter((n) => n.category.is_archived)
  const archivedSubs = tree
    .filter((n) => !n.category.is_archived)
    .flatMap((n) =>
      n.children.filter((c) => c.is_archived).map((c) => ({ sub: c, parent: n.category })),
    )

  function move(siblings: Category[], index: number, delta: -1 | 1) {
    const next = [...siblings]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + delta, 0, item)
    reorder.mutate(next)
  }

  function archive(category: Category) {
    update.mutate({ id: category.id, changes: { isArchived: !category.is_archived } })
    toast.success(category.is_archived ? `${category.name} restored` : `${category.name} archived`)
  }

  function row(
    category: Category,
    siblings: Category[],
    index: number,
    options: { isSub: boolean; hasSubs: boolean },
  ) {
    if (editing === category.id) {
      return (
        <li
          key={category.id}
          className={
            options.isSub ? 'flex items-center py-2 pr-3 pl-10' : 'flex items-center px-3 py-2'
          }
        >
          <CategoryEditor
            initialName={category.name}
            initialIcon={asIcon(category.icon)}
            submitLabel="Save"
            onCancel={() => setEditing(null)}
            onSubmit={(changes) => {
              update.mutate({ id: category.id, changes })
              setEditing(null)
            }}
          />
        </li>
      )
    }
    // Where this category can move: under another top-level category (only if it has no subs
    // of its own), or back to the top level.
    const targets =
      options.isSub || options.hasSubs ? [] : topLevel.filter((c) => c.id !== category.id)
    return (
      <li
        key={category.id}
        className={
          options.isSub
            ? 'flex items-center gap-3 py-2 pr-3 pl-10'
            : 'flex items-center gap-3 px-3 py-2'
        }
      >
        <CategoryIcon icon={category.icon} className={options.isSub ? 'size-7' : undefined} />
        <span
          className={
            options.isSub
              ? 'min-w-0 flex-1 truncate text-sm'
              : 'min-w-0 flex-1 truncate font-medium'
          }
        >
          {category.name}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={index === 0}
          onClick={() => move(siblings, index, -1)}
          aria-label={`Move ${category.name} up`}
        >
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={index === siblings.length - 1}
          onClick={() => move(siblings, index, 1)}
          aria-label={`Move ${category.name} down`}
        >
          <ArrowDownIcon aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${category.name}`}>
              <EllipsisIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(category.id)}>
              <PencilIcon aria-hidden />
              Rename
            </DropdownMenuItem>
            {!options.isSub && (
              <DropdownMenuItem onSelect={() => setAddingTo(category.id)}>
                <PlusIcon aria-hidden />
                Add sub-category
              </DropdownMenuItem>
            )}
            {targets.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInputIcon aria-hidden />
                  Move under…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {targets.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onSelect={() => {
                        update.mutate({ id: category.id, changes: { parentId: target.id } })
                        toast.success(`${category.name} is now under ${target.name}`)
                      }}
                    >
                      {target.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {options.isSub && (
              <DropdownMenuItem
                onSelect={() => {
                  update.mutate({ id: category.id, changes: { parentId: null } })
                  toast.success(`${category.name} is now a top-level category`)
                }}
              >
                <CornerLeftUpIcon aria-hidden />
                Move to top level
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => archive(category)}>
              <ArchiveIcon aria-hidden />
              {options.hasSubs ? 'Archive (with sub-categories)' : 'Archive'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    )
  }

  function archivedRow(category: Category, label: string, canRestore: boolean, isSub = false) {
    return (
      <li
        key={category.id}
        className={
          isSub ? 'flex items-center gap-3 py-2 pr-3 pl-10' : 'flex items-center gap-3 px-3 py-2'
        }
      >
        <CategoryIcon icon={category.icon} className={isSub ? 'size-7' : undefined} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {canRestore && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => archive(category)}
            aria-label={`Unarchive ${category.name}`}
          >
            <ArchiveRestoreIcon aria-hidden />
          </Button>
        )}
      </li>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Group categories with sub-categories (Utilities → Borehole). Totals and budgets for a
          category include its sub-categories. Archived categories are hidden when adding expenses
          but stay on older ones.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <ul className="divide-y rounded-xl border">
          {active.map((node, i) => [
            row(node.category, topLevel, i, { isSub: false, hasSubs: node.children.length > 0 }),
            ...node.children.map((child, j) =>
              row(child, node.children, j, { isSub: true, hasSubs: false }),
            ),
            addingTo === node.category.id && (
              <li key={`add-${node.category.id}`} className="flex items-center py-2 pr-3 pl-10">
                <CategoryEditor
                  initialName=""
                  initialIcon={asIcon(node.category.icon)}
                  submitLabel="Add"
                  placeholder={`Sub-category of ${node.category.name}`}
                  onCancel={() => setAddingTo(null)}
                  onSubmit={(input) => {
                    create.mutate({ ...input, parentId: node.category.id })
                    setAddingTo(null)
                  }}
                />
              </li>
            ),
          ])}
        </ul>
        <CategoryEditor
          initialName=""
          initialIcon="circle"
          submitLabel="Add"
          onSubmit={(input) => create.mutate(input)}
        />
      </section>

      {(archivedTop.length > 0 || archivedSubs.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Archived</h2>
          <ul className="divide-y rounded-xl border text-muted-foreground">
            {archivedTop.map((node) => [
              archivedRow(node.category, node.category.name, true),
              // Restored together with their parent.
              ...node.children.map((child) => archivedRow(child, child.name, false, true)),
            ])}
            {archivedSubs.map(({ sub, parent }) =>
              archivedRow(sub, `${parent.name} › ${sub.name}`, true),
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
