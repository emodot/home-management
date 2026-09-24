import type { Receipt } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { ExternalLinkIcon, FileImageIcon, FileTextIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { ReceiptFileButtons } from '@/components/receipt-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAddReceipts, useDeleteReceipt } from '@/hooks/use-expenses'
import { receiptUrlsQuery } from '@/lib/queries'

function Thumbnail({ receipt, url }: { receipt: Receipt; url: string | undefined }) {
  const [broken, setBroken] = useState(false)
  if (receipt.mime_type === 'application/pdf') {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
        <FileTextIcon className="size-8" aria-hidden />
        <span className="w-full truncate text-center text-xs">{receipt.file_name}</span>
      </div>
    )
  }
  if (!url) return <Skeleton className="size-full rounded-none" />
  if (broken) {
    // e.g. HEIC, which most browsers can't display.
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
        <FileImageIcon className="size-8" aria-hidden />
        <span className="w-full truncate text-center text-xs">{receipt.file_name}</span>
      </div>
    )
  }
  return (
    <img
      src={url}
      alt={receipt.file_name}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setBroken(true)}
    />
  )
}

export function ReceiptGallery({
  householdId,
  expenseId,
  receipts,
  readOnly,
}: {
  householdId: string
  expenseId: string
  receipts: Receipt[]
  readOnly?: boolean
}) {
  const paths = receipts.map((r) => r.storage_path)
  const urls = useQuery(receiptUrlsQuery(householdId, paths)).data ?? {}
  const addReceipts = useAddReceipts(householdId, expenseId)
  const deleteReceipt = useDeleteReceipt(householdId, expenseId)
  const [viewing, setViewing] = useState<Receipt | null>(null)

  function open(receipt: Receipt) {
    const url = urls[receipt.storage_path]
    if (receipt.mime_type === 'application/pdf') {
      if (url) window.open(url, '_blank', 'noopener')
    } else {
      setViewing(receipt)
    }
  }

  const viewingUrl = viewing ? urls[viewing.storage_path] : undefined

  return (
    <div className="flex flex-col gap-3">
      {receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No receipts yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              <button
                type="button"
                className="size-full"
                onClick={() => open(receipt)}
                aria-label={`View ${receipt.file_name}`}
              >
                <Thumbnail receipt={receipt} url={urls[receipt.storage_path]} />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1.5 shadow-sm"
                  onClick={() => deleteReceipt.mutate(receipt)}
                  aria-label={`Delete ${receipt.file_name}`}
                >
                  <Trash2Icon className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <ReceiptFileButtons
          onPicked={(files) => addReceipts.mutate(files)}
          disabled={addReceipts.isPending}
        />
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-[calc(100%-1rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{viewing?.file_name}</DialogTitle>
            <DialogDescription className="sr-only">Receipt image</DialogDescription>
          </DialogHeader>
          {viewing && viewingUrl && (
            <img
              src={viewingUrl}
              alt={viewing.file_name}
              className="max-h-[70dvh] w-full rounded-md object-contain"
            />
          )}
          <DialogFooter>
            {viewingUrl && (
              <Button variant="outline" asChild>
                <a href={viewingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon aria-hidden />
                  Open original
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
