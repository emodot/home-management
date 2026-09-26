import { formatDate, todayIn } from '@home/shared'
import { CheckIcon, CopyIcon, Share2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface InviteLink {
  url: string
  expiresAt: string
  /** Set when the link was also emailed (or emailing it was attempted). */
  email: string | null
  emailed: boolean
}

/** Shows a freshly made invite link to copy or share. It can't be shown again later. */
export function InviteLinkDialog({
  link,
  householdName,
  timezone,
  onClose,
}: {
  link: InviteLink | null
  householdName: string
  timezone: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator.share === 'function'

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.")
    }
  }

  async function share(url: string) {
    try {
      await navigator.share({
        title: `Join ${householdName} on Home`,
        text: `Join ${householdName} on Home to share expenses, tasks and providers.`,
        url,
      })
    } catch (error) {
      // Closing the share sheet isn't an error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) void copy(url)
    }
  }

  const expires = link ? formatDate(todayIn(timezone, new Date(link.expiresAt))) : ''

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {link?.emailed ? `Invite sent to ${link.email ?? ''}` : 'Invite link ready'}
          </DialogTitle>
          <DialogDescription>
            {link?.email && !link.emailed
              ? `We couldn't email ${link.email}. Share this link with them instead. `
              : ''}
            Anyone with this link can join {householdName}. It works once, until {expires}. Copy it
            now: it can&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>
        {link && (
          <Input
            readOnly
            value={link.url}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
        )}
        <DialogFooter>
          {link && canShare && (
            <Button variant="outline" onClick={() => void share(link.url)}>
              <Share2Icon aria-hidden />
              Share
            </Button>
          )}
          {link && (
            <Button onClick={() => void copy(link.url)}>
              {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
