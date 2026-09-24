import { createHouseholdSchema, type CreateHouseholdInput } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCreateHousehold } from '@/hooks/use-create-household'
import { errorMessage } from '@/lib/errors'

export function NewHouseholdPage() {
  const createHousehold = useCreateHousehold()
  const navigate = useNavigate()

  const form = useForm<CreateHouseholdInput>({
    resolver: zodResolver(createHouseholdSchema),
    defaultValues: { name: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      const household = await createHousehold.mutateAsync(input)
      toast.success(`Switched to ${household.name}`)
      await navigate('/', { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New household</h1>
        <p className="text-sm text-muted-foreground">
          For another home you manage. You can switch between households from the header.
        </p>
      </div>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Household name</FieldLabel>
            <Input
              id="name"
              placeholder="e.g. Mum's house, Abuja"
              autoFocus
              aria-invalid={!!errors.name}
              {...form.register('name')}
            />
            <FieldDescription>You&apos;ll be its first member.</FieldDescription>
            <FieldError errors={[errors.name]} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create household'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void navigate(-1)}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  )
}
