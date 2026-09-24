import type { Household } from '@home/shared'
import { LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLeaveHousehold } from '@/hooks/use-members'
import { errorCode, errorMessage } from '@/lib/errors'

const normalise = (value: string) => value.trim().toLocaleLowerCase()

export function LeaveHouseholdDialog({
  household,
  isLastMember,
}: {
  household: Household
  isLastMember: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  // Set when the server says we're the last member even though the page showed others.
  const [becameLast, setBecameLast] = useState(false)
  const leave = useLeaveHousehold(household)

  const deletes = isLastMember || becameLast
  const confirmed = !deletes || normalise(confirmation) === normalise(household.name)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmation('')
      setBecameLast(false)
    }
  }

  function handleLeave() {
    leave.mutate(deletes, {
      onError: (error) => {
        if (errorCode(error) === 'last_member') setBecameLast(true)
        else toast.error(errorMessage(error))
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <LogOutIcon aria-hidden />
          {isLastMember ? 'Delete household' : 'Leave household'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deletes ? `Delete ${household.name}?` : `Leave ${household.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deletes
              ? `You're the last member, so leaving permanently deletes ${household.name} and everything in it: expenses, receipts, tasks and providers. This can't be undone.`
              : "You'll lose access to everything in this household until someone invites you again."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {deletes && (
          <Field>
            <FieldLabel htmlFor="confirm-name">
              <span>
                Type <span className="font-semibold">{household.name}</span> to confirm
              </span>
            </FieldLabel>
            <Input
              id="confirm-name"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={leave.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleLeave}
            disabled={!confirmed || leave.isPending}
          >
            {leave.isPending
              ? deletes
                ? 'Deleting…'
                : 'Leaving…'
              : deletes
                ? 'Delete household'
                : 'Leave household'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
