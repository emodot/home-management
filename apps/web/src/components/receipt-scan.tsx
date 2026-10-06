import { parseReceiptText, todayIn, type ParsedReceipt } from '@home/shared'
import { LoaderCircleIcon, ScanLineIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { prepareReceiptFile, type PreparedReceipt } from '@/lib/images'
import { readReceiptText, UnreadableReceiptError } from '@/lib/receipt-ocr'

const ACCEPT = 'image/*,application/pdf'

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * "Scan receipt": pick a photo or PDF, read it on this device and hand back the file (always, so
 * it gets attached) with what was found on it (null if it couldn't be read or the scan was
 * cancelled). With `onPickedMany`, several files can be picked at once and are handed over unread.
 */
export function ScanReceiptButton({
  onScanned,
  onPickedMany,
  onBusyChange,
  disabled,
}: {
  onScanned: (file: PreparedReceipt, parsed: ParsedReceipt | null) => Promise<void> | void
  /** Two or more files picked: one expense each (see ReceiptBatch). */
  onPickedMany?: (files: File[]) => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
}) {
  const household = useActiveHousehold()
  const input = useRef<HTMLInputElement>(null)
  const scan = useRef<AbortController | null>(null)
  /** Null when idle, otherwise 0–1. */
  const [progress, setProgress] = useState<number | null>(null)

  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      scan.current?.abort()
    }
  }, [])

  async function handleFile(picked: File | undefined) {
    if (!picked) return
    const controller = new AbortController()
    scan.current = controller
    setProgress(0)
    onBusyChange?.(true)
    try {
      let file: PreparedReceipt
      try {
        file = await prepareReceiptFile(picked)
      } catch (error) {
        toast.error(errorMessage(error))
        return
      }
      let parsed: ParsedReceipt | null = null
      try {
        const text = await readReceiptText(file, {
          signal: controller.signal,
          onProgress: (value) => {
            if (!controller.signal.aborted) setProgress(value)
          },
        })
        parsed = parseReceiptText(text, { today: todayIn(household.timezone) })
      } catch (error) {
        if (unmounted.current) return // left the page mid-scan
        if (isAbort(error)) {
          toast('Scan cancelled. The receipt is still attached.')
        } else {
          const reason =
            error instanceof UnreadableReceiptError ? error.message : "Couldn't read that receipt"
          toast.error(`${reason}. It's attached, so fill in the details yourself.`)
        }
      }
      await onScanned(file, parsed)
    } finally {
      if (scan.current === controller) scan.current = null
      setProgress(null)
      onBusyChange?.(false)
    }
  }

  if (progress !== null) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5"
        role="status"
      >
        <LoaderCircleIcon
          className="size-5 shrink-0 animate-spin text-muted-foreground"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-medium">Reading receipt… {Math.round(progress * 100)}%</p>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
            />
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => scan.current?.abort()}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <ScanLineIcon aria-hidden />
        Scan receipt
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Fills in the amount, date and shop from a photo or PDF, read on this device.
        {onPickedMany && ' Pick several to add one expense for each.'}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label={onPickedMany ? 'Receipts to scan' : 'Receipt to scan'}
        multiple={!!onPickedMany}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 1 && onPickedMany) onPickedMany(files)
          else void handleFile(files[0])
        }}
      />
    </div>
  )
}
