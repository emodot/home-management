import type { Household } from '@home/shared'
import { LogOutIcon } from 'lucide-react'
import { useState } from 'react'
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
import { useLeaveHousehold } from '@/hooks/use-members'

/** Leaving never deletes the household; the last household admin is stopped by the server. */
export function LeaveHouseholdDialog({ household }: { household: Household }) {
  const [open, setOpen] = useState(false)
  const leave = useLeaveHousehold(household)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <LogOutIcon aria-hidden />
          Leave household
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {household.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll lose access to everything in this household until a household admin invites
            you again. The household and what you added stay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leave.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => leave.mutate(undefined, { onError: () => setOpen(false) })}
            disabled={leave.isPending}
          >
            {leave.isPending ? 'Leaving…' : 'Leave household'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
