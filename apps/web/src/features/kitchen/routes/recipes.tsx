import { formatMinutes, itemSearchKey, totalMinutes } from '@home/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { BookOpenIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { cn } from '@/lib/utils'
import { RecipePhoto } from '../components/recipe-photo'
import { recipePhotosQuery, recipesQuery } from '../lib/queries'

/** The household's recipe box: search, filter by tag, open one or add a new one. */
export function RecipesPage() {
  const household = useActiveHousehold()
  const recipes = useSuspenseQuery(recipesQuery(household.id)).data
  const paths = recipes.flatMap((r) => (r.photoPath ? [r.photoPath] : []))
  const photos = useQuery(recipePhotosQuery(household.id, paths)).data ?? {}
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const tags = [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b))
  const needle = itemSearchKey(q)
  const shown = recipes.filter(
    (r) =>
      (!needle || itemSearchKey(r.title).includes(needle)) &&
      (!tag || r.tags.some((t) => t.toLowerCase() === tag.toLowerCase())),
  )

  if (recipes.length === 0) {
    return (
      <EmptyState
        icon={BookOpenIcon}
        title="Your recipe box is empty"
        action={
          <Button asChild>
            <Link to="/kitchen/recipes/new">
              <PlusIcon aria-hidden />
              Add a recipe
            </Link>
          </Button>
        }
      >
        Keep the dishes your household cooks, with their ingredients and steps, and scale them for
        however many you're feeding.
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search recipes"
            aria-label="Search recipes"
            className="pl-9"
            value={q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>
        <Button asChild>
          <Link to="/kitchen/recipes/new">
            <PlusIcon aria-hidden />
            New recipe
          </Link>
        </Button>
      </div>

      {tags.length > 0 && (
        <div
          className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
          role="group"
          aria-label="Tag"
        >
          {['', ...tags].map((t) => {
            const on = t.toLowerCase() === tag.toLowerCase()
            return (
              <button
                key={t || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => set('tag', on ? '' : t)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors hover:bg-accent',
                  on && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
                )}
              >
                {t || 'All'}
              </button>
            )
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No matching recipes" size="sm">
          Try another name or tag.
        </EmptyState>
      ) : (
        <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const minutes = totalMinutes(r)
            return (
              <li key={r.id}>
                <Link
                  to={`/kitchen/recipes/${r.id}`}
                  className="group flex h-full flex-row overflow-hidden rounded-xl bg-muted/50 transition-colors hover:bg-accent sm:flex-col"
                >
                  <RecipePhoto
                    url={r.photoPath ? photos[r.photoPath] : undefined}
                    className="aspect-square w-24 shrink-0 sm:aspect-[16/10] sm:w-full"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Serves {r.servings}
                      {minutes !== null && ` · ${formatMinutes(minutes)}`}
                      {` · ${r.ingredientCount} ${r.ingredientCount === 1 ? 'ingredient' : 'ingredients'}`}
                    </span>
                    {r.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1 pt-0.5">
                        {r.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
