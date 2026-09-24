import type { Task } from '@home/shared'
import { ReceiptTextIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** "Log an expense for this?" after a task is marked done. */
export function LogExpensePrompt({
  completed,
  onClose,
}: {
  completed: { task: Task; completionId: string } | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  return (
    <Dialog open={completed !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log an expense for this?</DialogTitle>
          <DialogDescription>
            If {completed?.task.title ? `“${completed.task.title}”` : 'this'} cost money, record it
            now. It will be linked to this task.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            onClick={() => {
              if (completed) void navigate(`/expenses/new?completion=${completed.completionId}`)
              onClose()
            }}
          >
            <ReceiptTextIcon aria-hidden />
            Log expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
