import {
  recipeFormSchema,
  type KitchenItem,
  type Recipe,
  type RecipeFormInput,
  type RecipeFormValues,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ImageIcon, PlusIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useBlocker } from 'react-router'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActiveHousehold } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { prepareRecipePhoto } from '@/lib/images'
import { cn } from '@/lib/utils'
import { useSaveRecipe, type PhotoChange } from '../hooks/use-recipes'
import { ItemAutocomplete } from './item-autocomplete'
import { QuantityUnitInput } from './quantity-unit-input'
import { RecipePhoto } from './recipe-photo'

const chip =
  'inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent'

function defaults(recipe: Recipe | null): RecipeFormInput {
  if (!recipe) {
    return {
      title: '',
      servings: '4',
      prepMinutes: '',
      cookMinutes: '',
      tags: [],
      notes: '',
      ingredients: [],
      steps: [{ body: '' }],
    }
  }
  return {
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
    cookMinutes: recipe.cookMinutes === null ? '' : String(recipe.cookMinutes),
    tags: recipe.tags,
    notes: recipe.notes ?? '',
    ingredients: recipe.ingredients.map((i) => ({
      itemId: i.itemId,
      name: i.name,
      quantity: i.quantity === null ? '' : String(i.quantity),
      unit: i.unit,
      isOptional: i.isOptional,
      note: i.note ?? '',
    })),
    steps: recipe.steps.length > 0 ? recipe.steps.map((body) => ({ body })) : [{ body: '' }],
  }
}

/**
 * Adding or editing a recipe: details, photo, tags, ingredients from the catalogue and steps.
 * Saved in one go (the photo just after). Leaving with unsaved changes asks first.
 */
export function RecipeForm({
  recipe,
  tagSuggestions,
  photoUrl,
  onSaved,
}: {
  recipe: Recipe | null
  tagSuggestions: string[]
  photoUrl: string | undefined
  onSaved: (id: string) => void
}) {
  const household = useActiveHousehold()
  const save = useSaveRecipe(household.id, recipe)
  const form = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: defaults(recipe),
  })
  const { errors, isDirty } = form.formState
  const ingredients = useFieldArray({ control: form.control, name: 'ingredients' })
  const steps = useFieldArray({ control: form.control, name: 'steps' })
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
  const [savedId, setSavedId] = useState<string | null>(null)

  // Leaving with changes asks first; not once it's saved.
  const unsaved = (isDirty || photo.kind !== 'keep') && savedId === null
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  useEffect(() => {
    if (savedId) onSaved(savedId)
  }, [savedId, onSaved])

  const submit = form.handleSubmit((values) => {
    save.mutate(
      { values, photo },
      {
        onSuccess: (id) => {
          toast.success(recipe ? 'Recipe saved' : `${values.title} added`)
          setSavedId(id)
        },
        onError: (error) => toast.error(`Couldn't save it. ${errorMessage(error)}`),
      },
    )
  })

  function addIngredient(item: KitchenItem) {
    ingredients.append(
      {
        itemId: item.id,
        name: item.name,
        quantity: '',
        unit: item.defaultUnit,
        isOptional: false,
        note: '',
      },
      { shouldFocus: false },
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-8">
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="recipe-title">Name</FieldLabel>
          <Input
            id="recipe-title"
            autoComplete="off"
            maxLength={120}
            placeholder="e.g. Jollof rice"
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <PhotoField
          current={photoUrl}
          hasCurrent={!!recipe?.photoPath}
          change={photo}
          onChange={setPhoto}
        />

        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          <Field data-invalid={!!errors.servings}>
            <FieldLabel htmlFor="recipe-servings">Serves</FieldLabel>
            <Input
              id="recipe-servings"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              aria-invalid={!!errors.servings}
              {...form.register('servings')}
            />
            <FieldError errors={[errors.servings]} />
          </Field>
          <Field data-invalid={!!errors.prepMinutes}>
            <FieldLabel htmlFor="recipe-prep">Prep (min)</FieldLabel>
            <Input
              id="recipe-prep"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              aria-invalid={!!errors.prepMinutes}
              {...form.register('prepMinutes')}
            />
            <FieldError errors={[errors.prepMinutes]} />
          </Field>
          <Field data-invalid={!!errors.cookMinutes}>
            <FieldLabel htmlFor="recipe-cook">Cook (min)</FieldLabel>
            <Input
              id="recipe-cook"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              aria-invalid={!!errors.cookMinutes}
              {...form.register('cookMinutes')}
            />
            <FieldError errors={[errors.cookMinutes]} />
          </Field>
        </div>

        <Field>
          <FieldTitle>Tags</FieldTitle>
          <Controller
            control={form.control}
            name="tags"
            render={({ field }) => (
              <TagPicker
                value={field.value}
                onChange={field.onChange}
                suggestions={tagSuggestions}
              />
            )}
          />
          <FieldError errors={[errors.tags]} />
        </Field>
      </FieldGroup>

      <section className="flex flex-col gap-3" aria-labelledby="form-ingredients">
        <h3 id="form-ingredients" className="font-semibold">
          Ingredients
        </h3>
        {ingredients.fields.length > 0 && (
          <ol className="list-surface">
            {ingredients.fields.map((field, index) => (
              <IngredientFields
                key={field.id}
                index={index}
                name={field.name}
                control={form.control}
                register={form.register}
                error={errors.ingredients?.[index]?.quantity?.message}
                noteError={errors.ingredients?.[index]?.note?.message}
                first={index === 0}
                last={index === ingredients.fields.length - 1}
                onMove={(to) => ingredients.move(index, to)}
                onRemove={() => ingredients.remove(index)}
              />
            ))}
          </ol>
        )}
        {/* Enter picks a suggestion here; it mustn't also submit the recipe. */}
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
        >
          <ItemAutocomplete
            onSelect={addIngredient}
            label="Add an ingredient"
            placeholder="Add an ingredient…"
          />
        </div>
        <FieldDescription>
          Leave the amount empty for &ldquo;to taste&rdquo;. New ingredients join your items.
        </FieldDescription>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="form-steps">
        <h3 id="form-steps" className="font-semibold">
          Steps
        </h3>
        <ol className="flex flex-col gap-3">
          {steps.fields.map((field, index) => (
            <li key={field.id} className="flex gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary tabular-nums">
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Textarea
                  aria-label={`Step ${index + 1}`}
                  rows={2}
                  maxLength={2000}
                  aria-invalid={!!errors.steps?.[index]?.body}
                  {...form.register(`steps.${index}.body`)}
                />
                <FieldError errors={[errors.steps?.[index]?.body]} />
              </div>
              <RowButtons
                className="flex-col sm:flex-row"
                label={`step ${index + 1}`}
                first={index === 0}
                last={index === steps.fields.length - 1}
                onMove={(to) => steps.move(index, to)}
                onRemove={() => steps.remove(index)}
                index={index}
              />
            </li>
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => steps.append({ body: '' })}
          >
            <PlusIcon aria-hidden />
            Add a step
          </Button>
        </div>
      </section>

      <Field data-invalid={!!errors.notes}>
        <FieldLabel htmlFor="recipe-notes">Notes (optional)</FieldLabel>
        <Textarea
          id="recipe-notes"
          rows={3}
          maxLength={4000}
          placeholder="Where it came from, what to swap, how the family likes it"
          {...form.register('notes')}
        />
        <FieldError errors={[errors.notes]} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : recipe ? 'Save recipe' : 'Add recipe'}
        </Button>
      </div>

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipe ? 'Your changes to this recipe' : 'This recipe'} won&apos;t be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/** Move up, move down, remove: for an ingredient or step row. */
function RowButtons({
  label,
  index,
  first,
  last,
  onMove,
  onRemove,
  className,
}: {
  className?: string
  label: string
  index: number
  first: boolean
  last: boolean
  onMove: (to: number) => void
  onRemove: () => void
}) {
  return (
    <div className={cn('flex shrink-0 items-start', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} up`}
        disabled={first}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUpIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} down`}
        disabled={last}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDownIcon aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  )
}

function IngredientFields({
  index,
  name,
  control,
  register,
  error,
  noteError,
  first,
  last,
  onMove,
  onRemove,
}: {
  index: number
  name: string
  control: ReturnType<typeof useForm<RecipeFormInput, unknown, RecipeFormValues>>['control']
  register: ReturnType<typeof useForm<RecipeFormInput, unknown, RecipeFormValues>>['register']
  error: string | undefined
  noteError: string | undefined
  first: boolean
  last: boolean
  onMove: (to: number) => void
  onRemove: () => void
}) {
  const optional = useWatch({ control, name: `ingredients.${index}.isOptional` })
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <RowButtons
          label={name}
          index={index}
          first={first}
          last={last}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]">
        <div className="col-span-2 sm:col-span-1">
          <Controller
            control={control}
            name={`ingredients.${index}.unit`}
            render={({ field: unitField }) => (
              <Controller
                control={control}
                name={`ingredients.${index}.quantity`}
                render={({ field }) => (
                  <QuantityUnitInput
                    quantity={field.value}
                    unit={unitField.value}
                    onQuantityChange={field.onChange}
                    onUnitChange={unitField.onChange}
                    invalid={!!error}
                    placeholder="to taste"
                  />
                )}
              />
            )}
          />
        </div>
        <Input
          aria-label={`Note for ${name}`}
          placeholder="Note, e.g. chopped"
          autoComplete="off"
          maxLength={200}
          aria-invalid={!!noteError}
          {...register(`ingredients.${index}.note`)}
        />
        <Controller
          control={control}
          name={`ingredients.${index}.isOptional`}
          render={({ field }) => (
            <button
              type="button"
              aria-pressed={optional}
              onClick={() => field.onChange(!field.value)}
              className={cn(
                chip,
                'justify-center',
                optional && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
              )}
            >
              {optional && <CheckIcon className="mr-1 size-4" aria-hidden />}
              Optional
            </button>
          )}
        />
      </div>
      {(error ?? noteError) && (
        <p className="text-sm text-destructive" role="alert">
          {error ?? noteError}
        </p>
      )}
    </li>
  )
}

/** Tag chips: the suggestions and any chosen tags, tap to toggle, plus "Add tag". */
function TagPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions: string[]
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const has = (tag: string) => value.some((t) => t.toLowerCase() === tag.toLowerCase())
  const shown = [
    ...suggestions,
    ...value.filter((t) => !suggestions.some((s) => s.toLowerCase() === t.toLowerCase())),
  ]

  function toggle(tag: string) {
    onChange(
      has(tag) ? value.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...value, tag],
    )
  }

  function addDraft() {
    const tag = draft.trim().slice(0, 30)
    if (tag && !has(tag)) onChange([...value, tag])
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
      {shown.map((tag) => {
        const on = has(tag)
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            className={cn(
              chip,
              on && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
            )}
            onClick={() => toggle(tag)}
          >
            {on && <CheckIcon className="mr-1 size-4" aria-hidden />}
            {tag}
          </button>
        )
      })}
      {adding ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            aria-label="New tag"
            placeholder="e.g. Sunday"
            maxLength={30}
            className="h-9 w-36"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <Button type="button" size="sm" className="h-9" onClick={addDraft}>
            Add
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(chip, 'border-dashed text-muted-foreground')}
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="mr-1 size-4" aria-hidden />
          Add tag
        </button>
      )}
    </div>
  )
}

/** One photo: choose, change or remove. The new one is shown at once and uploaded on save. */
function PhotoField({
  current,
  hasCurrent,
  change,
  onChange,
}: {
  current: string | undefined
  hasCurrent: boolean
  change: PhotoChange
  onChange: (change: PhotoChange) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A picked photo's preview URL is let go when it's replaced or the form closes.
  useEffect(() => {
    if (change.kind !== 'set') return
    const { preview } = change
    return () => URL.revokeObjectURL(preview)
  }, [change])

  const showing =
    change.kind === 'set' ? change.preview : change.kind === 'remove' ? undefined : current
  const has = change.kind === 'set' || (change.kind === 'keep' && hasCurrent)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const photo = await prepareRecipePhoto(file)
      onChange({ kind: 'set', photo, preview: URL.createObjectURL(photo) })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Field data-invalid={!!error}>
      <FieldTitle>Photo (optional)</FieldTitle>
      <div className="flex flex-wrap items-center gap-3">
        {has && <RecipePhoto url={showing} className="aspect-[4/3] w-32 rounded-lg" />}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Recipe photo"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImageIcon aria-hidden />
          {busy ? 'Preparing…' : has ? 'Change photo' : 'Add a photo'}
        </Button>
        {has && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(hasCurrent ? { kind: 'remove' } : { kind: 'keep' })}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Field>
  )
}
