import {
  PROVIDER_TRADES,
  providerInputSchema,
  TRADE_LABELS,
  type ProviderInput,
  type ProviderValues,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { StarRatingInput } from '@/components/star-rating'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

/**
 * The provider form. `compact` shows just name, trade and phone (for adding one inline from an
 * expense); WhatsApp defaults to the phone number when left empty.
 */
export function ProviderForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
  compact = false,
}: {
  defaultValues: ProviderInput
  submitLabel: string
  onSubmit: (values: ProviderValues) => Promise<void>
  onCancel: () => void
  compact?: boolean
}) {
  const form = useForm<ProviderInput, unknown, ProviderValues>({
    resolver: zodResolver(providerInputSchema),
    defaultValues,
  })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit((values) =>
    onSubmit({ ...values, whatsapp: values.whatsapp ?? (compact ? values.phone : null) }),
  )

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation() // may be rendered inside another form's dialog
        void submit(e)
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="provider-name">Name</FieldLabel>
          <Input
            id="provider-name"
            autoComplete="off"
            placeholder="e.g. Musa (electrician)"
            autoFocus
            aria-invalid={!!errors.name}
            {...form.register('name')}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="provider-trade">Trade</FieldLabel>
          <Controller
            control={form.control}
            name="trade"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="provider-trade" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TRADES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TRADE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="provider-phone">Phone</FieldLabel>
            <Input
              id="provider-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0803 123 4567"
              aria-invalid={!!errors.phone}
              {...form.register('phone')}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
          {!compact && (
            <Field data-invalid={!!errors.whatsapp}>
              <FieldLabel htmlFor="provider-whatsapp">WhatsApp</FieldLabel>
              <Input
                id="provider-whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="If different from phone"
                aria-invalid={!!errors.whatsapp}
                {...form.register('whatsapp')}
              />
              <FieldError errors={[errors.whatsapp]} />
            </Field>
          )}
        </div>
        {!compact && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="provider-email">Email</FieldLabel>
                <Input
                  id="provider-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  aria-invalid={!!errors.email}
                  {...form.register('email')}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field data-invalid={!!errors.area}>
                <FieldLabel htmlFor="provider-area">Area</FieldLabel>
                <Input
                  id="provider-area"
                  placeholder="e.g. Lekki Phase 1"
                  aria-invalid={!!errors.area}
                  {...form.register('area')}
                />
                <FieldError errors={[errors.area]} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="provider-rating">Rating</FieldLabel>
              <Controller
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <StarRatingInput
                    id="provider-rating"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldDescription>Tap the same star again to clear it.</FieldDescription>
            </Field>
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="provider-notes">Notes</FieldLabel>
              <Textarea
                id="provider-notes"
                rows={3}
                placeholder="Rates, reliability, who recommended them…"
                aria-invalid={!!errors.notes}
                {...form.register('notes')}
              />
              <FieldError errors={[errors.notes]} />
            </Field>
          </>
        )}
      </FieldGroup>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
