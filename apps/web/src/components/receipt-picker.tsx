import { CameraIcon, FileTextIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-lookups'
import { errorMessage } from '@/lib/errors'
import { prepareReceiptFile, type PreparedReceipt } from '@/lib/images'

export interface PickedReceipt {
  key: string
  file: PreparedReceipt
  previewUrl: string | null
}

const ACCEPT = 'image/*,application/pdf'

/** "Take photo" (phones) and "Choose files" buttons. Calls onPicked with validated, shrunk files. */
export function ReceiptFileButtons({
  onPicked,
  disabled,
  size = 'sm',
}: {
  onPicked: (files: PreparedReceipt[]) => void
  disabled?: boolean
  size?: 'sm' | 'default'
}) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const isTouch = useMediaQuery('(pointer: coarse)')

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setBusy(true)
    const prepared: PreparedReceipt[] = []
    for (const file of Array.from(list)) {
      try {
        prepared.push(await prepareReceiptFile(file))
      } catch (error) {
        toast.error(errorMessage(error))
      }
    }
    setBusy(false)
    if (prepared.length > 0) onPicked(prepared)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isTouch && (
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={(disabled ?? false) || busy}
          onClick={() => cameraInput.current?.click()}
        >
          <CameraIcon aria-hidden />
          Take photo
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={(disabled ?? false) || busy}
        onClick={() => fileInput.current?.click()}
      >
        <PaperclipIcon aria-hidden />
        {busy ? 'Preparing…' : isTouch ? 'Choose file' : 'Attach receipt'}
      </Button>
      <input
        ref={cameraInput}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Receipts chosen in the add form, before the expense exists. */
export function ReceiptPicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedReceipt[]
  onChange: (next: PickedReceipt[]) => void
  disabled?: boolean
}) {
  // Preview URLs created here, revoked on removal or when the picker goes away.
  const previewUrls = useRef(new Set<string>())
  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  function add(files: PreparedReceipt[]) {
    onChange([
      ...value,
      ...files.map((file) => {
        const previewUrl = file.mimeType.startsWith('image/')
          ? URL.createObjectURL(file.data)
          : null
        if (previewUrl) previewUrls.current.add(previewUrl)
        return { key: crypto.randomUUID(), file, previewUrl }
      }),
    ])
  }

  function remove(key: string) {
    const removed = value.find((r) => r.key === key)
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl)
      previewUrls.current.delete(removed.previewUrl)
    }
    onChange(value.filter((r) => r.key !== key))
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((r) => (
            <li key={r.key} className="relative size-20 overflow-hidden rounded-lg border bg-muted">
              {r.previewUrl ? (
                <img src={r.previewUrl} alt={r.file.fileName} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
                  <FileTextIcon className="size-6" aria-hidden />
                  <span className="w-full truncate text-center text-[10px]">{r.file.fileName}</span>
                </div>
              )}
              <button
                type="button"
                className="absolute top-1 right-1 rounded-full bg-background/90 p-1 shadow-sm"
                onClick={() => remove(r.key)}
                aria-label={`Remove ${r.file.fileName}`}
                disabled={disabled}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ReceiptFileButtons onPicked={add} disabled={disabled} />
    </div>
  )
}
