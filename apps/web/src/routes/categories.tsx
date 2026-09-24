import {
  categoryInputSchema,
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
  PencilIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { CategoryIconPicker } from '@/components/category-icon-picker'
import { Button } from '@/components/ui/button'
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
  onSubmit,
  onCancel,
}: {
  initialName: string
  initialIcon: CategoryIconName
  submitLabel: string
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
        placeholder="Category name"
        aria-label="Category name"
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

  const active = categories.filter((c) => !c.is_archived)
  const archived = categories.filter((c) => c.is_archived)

  function move(index: number, delta: -1 | 1) {
    const next = [...active]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + delta, 0, item)
    reorder.mutate([...next, ...archived])
  }

  function row(category: Category, index: number) {
    if (editing === category.id) {
      return (
        <li key={category.id} className="flex items-center px-3 py-2">
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
    return (
      <li key={category.id} className="flex items-center gap-3 px-3 py-2">
        <CategoryIcon icon={category.icon} />
        <span className="min-w-0 flex-1 truncate font-medium">{category.name}</span>
        {!category.is_archived && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${category.name} up`}
            >
              <ArrowUpIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={index === active.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${category.name} down`}
            >
              <ArrowDownIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditing(category.id)}
              aria-label={`Rename ${category.name}`}
            >
              <PencilIcon aria-hidden />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            update.mutate({ id: category.id, changes: { isArchived: !category.is_archived } })
            toast.success(
              category.is_archived ? `${category.name} restored` : `${category.name} archived`,
            )
          }}
          aria-label={
            category.is_archived ? `Unarchive ${category.name}` : `Archive ${category.name}`
          }
        >
          {category.is_archived ? <ArchiveRestoreIcon aria-hidden /> : <ArchiveIcon aria-hidden />}
        </Button>
      </li>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Archived categories are hidden when adding expenses but stay on older ones.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <ul className="divide-y rounded-xl border">{active.map((c, i) => row(c, i))}</ul>
        <CategoryEditor
          initialName=""
          initialIcon="circle"
          submitLabel="Add"
          onSubmit={(input) => create.mutate(input)}
        />
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Archived</h2>
          <ul className="divide-y rounded-xl border text-muted-foreground">
            {archived.map((c, i) => row(c, i))}
          </ul>
        </section>
      )}
    </div>
  )
}
