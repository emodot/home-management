import {
  batchDuplicates,
  expenseFormSchema,
  findMatchingExpenses,
  formatDate,
  formatMoney,
  monthOf,
  parseReceiptText,
  suggestCategoryId,
  todayIn,
  toMinor,
  type Category,
  type ExpenseInput,
  type Member,
  type ParsedReceipt,
} from '@home/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  CopyIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PlusIcon,
  ScanTextIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CategoryOptions } from '@/components/category-options'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateExpenses } from '@/hooks/use-expenses'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { formatAmountInput, tidyAmountInput } from '@/lib/amount'
import { errorMessage } from '@/lib/errors'
import { prepareReceiptFile, type PreparedReceipt } from '@/lib/images'
import { expensesKey } from '@/lib/queries'
import { createReceiptReader, UnreadableReceiptError, type ReceiptReader } from '@/lib/receipt-ocr'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Receipts read on the device one after another; more than this is slow on older phones. */
export const MAX_BATCH_RECEIPTS = 20

const ACCEPT = 'image/*,application/pdf'

type DraftField = 'amount' | 'description' | 'categoryId' | 'occurredOn'

interface Draft {
  key: string
  fileName: string
  /** Null until the picked file has been checked and shrunk. */
  file: PreparedReceipt | null
  /** An object URL for viewing the file; revoked when the draft goes. */
  url: string | null
  status: 'preparing' | 'waiting' | 'reading' | 'read' | 'unreadable'
  /** 0–1 while reading. */
  progress: number
  values: Record<DraftField, string>
  /** Typed into, so a scan finishing later leaves them alone. */
  edited: ReadonlySet<DraftField>
  /** Filled in from the receipt and not changed since. */
  fromReceipt: ReadonlySet<DraftField>
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

function amountOf(value: string): number | null {
  try {
    const minor = toMinor(value)
    return minor > 0 ? minor : null
  } catch {
    return null
  }
}

function newDraft(file: File, today: string): Draft {
  return {
    key: crypto.randomUUID(),
    fileName: file.name,
    file: null,
    url: null,
    status: 'preparing',
    progress: 0,
    values: { amount: '', description: '', categoryId: '', occurredOn: today },
    edited: new Set(),
    fromReceipt: new Set(),
  }
}

/** The draft as an expense, or its first problem per field. */
function validate(draft: Draft, paidBy: string | null) {
  const result = expenseFormSchema.safeParse({
    ...draft.values,
    paidBy,
    providerId: null,
    notes: null,
    budgetMonth: isDate(draft.values.occurredOn) ? monthOf(draft.values.occurredOn) : '',
  })
  if (result.success) return { input: result.data as ExpenseInput, errors: {} }
  const errors: Partial<Record<DraftField, string>> = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0] as DraftField
    errors[field] ??= issue.message
  }
  return { input: null, errors }
}

/**
 * Review screen for several scanned receipts: one draft expense per file, read on this device one
 * at a time, all saved together. Drafts live only in memory, so leaving asks first.
 */
export function ReceiptBatch({
  files,
  categories,
  members,
  onDiscard,
}: {
  files: File[]
  categories: Category[]
  members: Member[]
  /** Back to the single Add expense form. */
  onDiscard: () => void
}) {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const create = useCreateExpenses(household.id)
  const today = todayIn(household.timezone)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [paidBy, setPaidBy] = useState<string>(user.id)
  const [attempted, setAttempted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // The queue reads drafts between renders, so the ref is the source of truth and state follows it.
  const latest = useRef(drafts)
  function commit(change: (list: Draft[]) => Draft[]) {
    latest.current = change(latest.current)
    setDrafts(latest.current)
  }
  const raw = useRef(new Map<string, File>())
  const reader = useRef<ReceiptReader | null>(null)
  const current = useRef<{ key: string; controller: AbortController } | null>(null)
  const running = useRef(false)
  const unmounted = useRef(false)

  const activeCategories = categories.filter((c) => !c.is_archived)

  /** False once the draft was removed or the screen closed (both can happen mid-await). */
  const isListed = (key: string) => !unmounted.current && latest.current.some((d) => d.key === key)

  function update(key: string, change: (draft: Draft) => Draft) {
    commit((list) => list.map((d) => (d.key === key ? change(d) : d)))
  }

  function drop(key: string) {
    const draft = latest.current.find((d) => d.key === key)
    if (draft?.url) URL.revokeObjectURL(draft.url)
    raw.current.delete(key)
    if (current.current?.key === key) current.current.controller.abort()
    commit((list) => list.filter((d) => d.key !== key))
  }

  // ---------------------------------------------------------------- adding and reading

  async function addFiles(picked: File[]) {
    const room = MAX_BATCH_RECEIPTS - latest.current.length
    if (picked.length > room) {
      toast(
        room === 0
          ? `A batch can hold ${MAX_BATCH_RECEIPTS} receipts. Save these first.`
          : `Added the first ${room}. A batch can hold ${MAX_BATCH_RECEIPTS} receipts.`,
      )
    }
    const added = picked.slice(0, Math.max(0, room)).map((file) => {
      const draft = newDraft(file, today)
      raw.current.set(draft.key, file)
      return draft
    })
    if (added.length === 0) return
    commit((list) => [...list, ...added])

    // Shrinking photos is quick, so do it up front for the thumbnails; reading waits its turn.
    for (const { key } of added) {
      const file = raw.current.get(key)
      if (!file || !isListed(key)) continue
      try {
        const prepared = await prepareReceiptFile(file)
        raw.current.delete(key)
        if (!isListed(key)) continue
        const url = URL.createObjectURL(prepared.data)
        update(key, (d) => ({ ...d, file: prepared, url, status: 'waiting' }))
        void readQueue()
      } catch (error) {
        toast.error(errorMessage(error))
        drop(key)
      }
    }
  }

  function applyScan(key: string, parsed: ParsedReceipt) {
    update(key, (d) => {
      const values = { ...d.values }
      const filled = new Set(d.fromReceipt)
      const fill = (field: DraftField, value: string | null) => {
        if (value === null || d.edited.has(field)) return
        values[field] = value
        filled.add(field)
      }
      fill('amount', parsed.amountMinor === null ? null : formatAmountInput(parsed.amountMinor))
      fill('occurredOn', parsed.occurredOn)
      fill('description', parsed.vendor)
      const nothing = parsed.amountMinor === null && parsed.occurredOn === null && !parsed.vendor
      return { ...d, values, fromReceipt: filled, status: nothing ? 'unreadable' : 'read' }
    })
  }

  async function suggestCategory(key: string, vendor: string) {
    try {
      const id = await suggestCategoryId(supabase, household.id, vendor)
      if (!id || !activeCategories.some((c) => c.id === id)) return
      update(key, (d) =>
        d.edited.has('categoryId') || d.values.categoryId
          ? d
          : {
              ...d,
              values: { ...d.values, categoryId: id },
              fromReceipt: new Set([...d.fromReceipt, 'categoryId']),
            },
      )
    } catch {
      // A suggestion is optional.
    }
  }

  /** Reads waiting drafts one at a time with a single OCR engine. */
  async function readQueue() {
    if (running.current) return
    running.current = true
    try {
      for (;;) {
        const next = latest.current.find((d) => d.status === 'waiting')
        if (!next?.file || unmounted.current) break
        const { key, file } = next
        const controller = new AbortController()
        current.current = { key, controller }
        update(key, (d) => ({ ...d, status: 'reading', progress: 0 }))
        reader.current ??= createReceiptReader()
        try {
          const text = await reader.current.read(file, {
            signal: controller.signal,
            onProgress: (progress) => {
              if (!controller.signal.aborted) update(key, (d) => ({ ...d, progress }))
            },
          })
          const parsed = parseReceiptText(text, { today })
          applyScan(key, parsed)
          if (parsed.vendor) void suggestCategory(key, parsed.vendor)
        } catch (error) {
          if (controller.signal.aborted) continue // removed, or the screen closed
          if (!(error instanceof UnreadableReceiptError)) console.error(error)
          update(key, (d) => ({ ...d, status: 'unreadable' }))
        } finally {
          current.current = null
        }
      }
    } finally {
      running.current = false
    }
  }

  // Start with the files picked on Add expense; free everything when the screen goes.
  const started = useRef(false)
  useEffect(() => {
    unmounted.current = false
    if (!started.current) {
      started.current = true
      void addFiles(files)
    }
    return () => {
      unmounted.current = true
      current.current?.controller.abort()
      reader.current?.close()
      reader.current = null
      for (const d of latest.current) if (d.url) URL.revokeObjectURL(d.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, with the files it opened with
  }, [])

  // ---------------------------------------------------------------- editing

  function edit(key: string, field: DraftField, value: string) {
    update(key, (d) => {
      const edited = new Set(d.edited).add(field)
      const fromReceipt = new Set(d.fromReceipt)
      fromReceipt.delete(field)
      return { ...d, values: { ...d.values, [field]: value }, edited, fromReceipt }
    })
  }

  // ---------------------------------------------------------------- duplicates

  const entries = drafts.map((d) => ({
    amountMinor: amountOf(d.values.amount),
    occurredOn: isDate(d.values.occurredOn) ? d.values.occurredOn : null,
  }))
  const candidates = entries
    .filter((e) => e.amountMinor !== null && e.occurredOn !== null)
    .map((e) => ({ amountMinor: e.amountMinor ?? 0, occurredOn: e.occurredOn ?? '' }))
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.amountMinor - b.amountMinor)
  const matching = useQuery({
    queryKey: [
      ...expensesKey(household.id),
      'matching',
      candidates.map((c) => `${c.amountMinor}|${c.occurredOn}`).join(','),
    ],
    queryFn: () => findMatchingExpenses(supabase, household.id, candidates),
    // Off while saving, so the new expenses never show up as their own duplicates.
    enabled: candidates.length > 0 && !create.isPending && !create.isSuccess,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
  const duplicates = batchDuplicates(entries, matching.data ?? [])

  // ---------------------------------------------------------------- saving and leaving

  const checked = drafts.map((d) => validate(d, paidBy))
  const busy = drafts.filter((d) => d.status === 'preparing' || d.status === 'reading').length
  const waiting = drafts.filter((d) => d.status === 'waiting').length
  const reading = busy + waiting > 0
  const total = entries.reduce((sum, e) => sum + (e.amountMinor ?? 0), 0)

  async function save() {
    setAttempted(true)
    const firstInvalid = drafts.findIndex((_, i) => checked[i]?.input === null)
    if (firstInvalid !== -1) {
      const field = (Object.keys(checked[firstInvalid]?.errors ?? {})[0] ?? 'amount') as DraftField
      document.getElementById(`${drafts[firstInvalid]?.key}-${field}`)?.focus()
      const invalid = checked.filter((c) => c.input === null).length
      toast.error(
        invalid === 1
          ? 'One receipt still needs details.'
          : `${invalid} receipts still need details.`,
      )
      return
    }
    const batch = drafts.flatMap((d, i) => {
      const input = checked[i]?.input
      return input && d.file ? [{ input, file: d.file }] : []
    })
    try {
      await create.mutateAsync(batch)
      setSaved(true)
      toast.success(batch.length === 1 ? 'Expense added' : `Added ${batch.length} expenses`)
    } catch (error) {
      toast.error(`Couldn't save the expenses. Nothing was saved. ${errorMessage(error)}`)
    }
  }

  useEffect(() => {
    if (saved) void navigate('/', { replace: true })
  }, [saved, navigate])

  const unsaved = drafts.length > 0 && !saved
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

  // Removing every receipt goes back to the single form.
  useEffect(() => {
    if (started.current && drafts.length === 0 && raw.current.size === 0) onDiscard()
  }, [drafts.length, onDiscard])

  const addInput = useRef<HTMLInputElement>(null)
  const discardOpen = confirmDiscard || blocker.state === 'blocked'
  const count = drafts.length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add expenses from receipts</h1>
        <p className="text-sm text-muted-foreground">
          {reading
            ? `Reading ${count === 1 ? 'the receipt' : `${count} receipts`} on this device… ${count - busy - waiting} of ${count} done. You can edit as they fill in.`
            : 'One expense per receipt. Check each one, then save them together.'}
        </p>
      </div>

      <Field className="max-w-xs">
        <FieldLabel htmlFor="batch-paid-by">Paid by</FieldLabel>
        <Select value={paidBy} onValueChange={setPaidBy}>
          <SelectTrigger id="batch-paid-by" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profile.full_name ?? m.profile.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <ol className="@container list-surface">
        {drafts.map((draft, index) => (
          <DraftRow
            key={draft.key}
            draft={draft}
            number={index + 1}
            categories={activeCategories}
            errors={attempted ? (checked[index]?.errors ?? {}) : {}}
            duplicate={(() => {
              const dup = duplicates[index]
              if (!dup) return null
              if (dup.kind === 'batch') return `Same amount and date as receipt ${dup.index + 1}.`
              const { expense } = dup
              const what = `${formatMoney(expense.amountMinor)} “${expense.description}” on ${formatDate(expense.occurredOn)}`
              return expense.status === 'pending'
                ? `${what} is waiting to be confirmed.`
                : `${what} is already logged.`
            })()}
            onEdit={(field, value) => edit(draft.key, field, value)}
            onRemove={() => drop(draft.key)}
          />
        ))}
      </ol>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={count >= MAX_BATCH_RECEIPTS || create.isPending}
          onClick={() => addInput.current?.click()}
        >
          <PlusIcon aria-hidden />
          Add receipts
        </Button>
        <input
          ref={addInput}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          aria-label="More receipts to scan"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button
          type="button"
          className="flex-1 md:flex-none"
          disabled={reading || create.isPending || count === 0}
          onClick={() => void save()}
        >
          {create.isPending
            ? 'Saving…'
            : reading
              ? 'Reading receipts…'
              : count === 1
                ? 'Save expense'
                : `Save ${count} expenses`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmDiscard(true)}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        {total > 0 && (
          <p className="ml-auto hidden text-sm text-muted-foreground tabular-nums sm:block">
            Total {formatMoney(total)}
          </p>
        )}
      </div>

      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (open) return
          setConfirmDiscard(false)
          if (blocker.state === 'blocked') blocker.reset()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard {count === 1 ? 'this receipt' : `${count} receipts`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Nothing has been saved yet. The receipts and anything you typed will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed()
                else onDiscard()
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DraftRow({
  draft,
  number,
  categories,
  errors,
  duplicate,
  onEdit,
  onRemove,
}: {
  draft: Draft
  number: number
  categories: Category[]
  errors: Partial<Record<DraftField, string>>
  duplicate: string | null
  onEdit: (field: DraftField, value: string) => void
  onRemove: () => void
}) {
  const { key, values, status, fromReceipt } = draft
  const id = (field: DraftField) => `${key}-${field}`
  const of = `receipt ${number}`
  const isImage = draft.file?.mimeType.startsWith('image/') ?? false
  const problems = Object.values(errors)

  return (
    <li
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 @3xl:grid-cols-[3.5rem_minmax(0,1fr)_auto] @3xl:items-start"
      aria-label={`Receipt ${number}, ${draft.fileName}`}
    >
      <a
        href={draft.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground @3xl:size-14"
        aria-label={`Open ${draft.fileName}`}
      >
        {draft.url && isImage ? (
          <img src={draft.url} alt="" className="size-full object-cover" />
        ) : status === 'preparing' ? (
          <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />
        ) : (
          <FileTextIcon className="size-6" aria-hidden />
        )}
      </a>
      <p className="truncate text-sm text-muted-foreground @3xl:hidden">
        {number}. {draft.fileName}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-mr-1 text-muted-foreground"
        onClick={onRemove}
        aria-label={`Remove ${of}`}
      >
        <XIcon aria-hidden />
      </Button>

      <div className="col-span-3 flex min-w-0 flex-col gap-2 @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1">
        <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,11rem)_9.5rem]">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              ₦
            </span>
            <Input
              id={id('amount')}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Amount"
              aria-label={`Amount, ${of}`}
              aria-invalid={!!errors.amount}
              className="bg-background pl-7 font-semibold tabular-nums dark:bg-background"
              value={values.amount}
              onChange={(e) => onEdit('amount', e.target.value)}
              onBlur={(e) => {
                const tidy = tidyAmountInput(e.target.value)
                if (tidy !== e.target.value) onEdit('amount', tidy)
              }}
            />
          </div>
          <Input
            id={id('description')}
            autoComplete="off"
            placeholder="What was it for?"
            aria-label={`What it was for, ${of}`}
            aria-invalid={!!errors.description}
            className="order-2 col-span-2 bg-background @md:col-span-1 @3xl:order-none dark:bg-background"
            value={values.description}
            onChange={(e) => onEdit('description', e.target.value)}
          />
          <Select value={values.categoryId} onValueChange={(value) => onEdit('categoryId', value)}>
            <SelectTrigger
              id={id('categoryId')}
              className="order-2 col-span-2 w-full bg-background @md:col-span-1 @3xl:order-none dark:bg-background"
              aria-label={`Category, ${of}`}
              aria-invalid={!!errors.categoryId}
            >
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <CategoryOptions categories={categories} icons />
            </SelectContent>
          </Select>
          <Input
            id={id('occurredOn')}
            type="date"
            aria-label={`Date, ${of}`}
            aria-invalid={!!errors.occurredOn}
            className="order-1 bg-background @3xl:order-none dark:bg-background"
            value={values.occurredOn}
            onChange={(e) => onEdit('occurredOn', e.target.value)}
          />
        </div>

        <RowStatus draft={draft} />
        {fromReceipt.size > 0 && status === 'read' && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ScanTextIcon className="size-3.5 shrink-0" aria-hidden />
            Filled in from the receipt. Please check it.
          </p>
        )}
        {duplicate && (
          <p className="flex items-start gap-1.5 text-xs">
            <CopyIcon className="mt-px size-3.5 shrink-0 text-status-warning" aria-hidden />
            <span>Possible duplicate: {duplicate}</span>
          </p>
        )}
        {problems.length > 0 && (
          <p className="text-xs text-destructive" role="alert">
            {problems.join(' · ')}
          </p>
        )}
      </div>
    </li>
  )
}

function RowStatus({ draft }: { draft: Draft }) {
  if (draft.status === 'reading' || draft.status === 'waiting' || draft.status === 'preparing') {
    const percent = Math.round(draft.progress * 100)
    return (
      <div className="flex items-center gap-2" role="status">
        <p className="shrink-0 text-xs text-muted-foreground">
          {draft.status === 'reading' ? `Reading… ${percent}%` : 'Waiting to be read'}
        </p>
        {draft.status === 'reading' && (
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-background">
            <div
              className={cn('h-full rounded-full bg-primary transition-[width]')}
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
        )}
      </div>
    )
  }
  if (draft.status === 'unreadable') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
        Couldn&apos;t read this one. Fill it in yourself; the file will still be attached.
      </p>
    )
  }
  return null
}
