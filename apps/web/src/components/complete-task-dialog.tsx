import {
  completeTaskSchema,
  type CompleteTaskInput,
  type CompleteTaskValues,
  type Task,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/** Mark done with a date (defaults to today) and optional notes. */
export function CompleteTaskDialog({
  task,
  today,
  open,
  onOpenChange,
  onComplete,
}: {
  task: Task
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (input: CompleteTaskInput) => void
}) {
  const form = useForm<CompleteTaskInput, unknown, CompleteTaskValues>({
    resolver: zodResolver(completeTaskSchema),
    defaultValues: { completedOn: today, notes: '' },
  })
  const { errors } = form.formState
  const submit = form.handleSubmit((values) => {
    onComplete({ completedOn: values.completedOn, notes: values.notes ?? '' })
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark “{task.title}” done</DialogTitle>
          <DialogDescription>
            {task.schedule_type === 'once'
              ? 'It will move to your done tasks.'
              : 'The next due date is worked out from this.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.completedOn}>
              <FieldLabel htmlFor="completedOn">Done on</FieldLabel>
              <Input id="completedOn" type="date" max={today} {...form.register('completedOn')} />
              <FieldError errors={[errors.completedOn]} />
            </Field>
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="completion-notes">Notes (optional)</FieldLabel>
              <Textarea
                id="completion-notes"
                rows={2}
                placeholder="e.g. Replaced the oil filter"
                {...form.register('notes')}
              />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <CheckIcon aria-hidden />
              Mark done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
