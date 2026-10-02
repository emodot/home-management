import { formatMoney } from '@home/shared'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setIncomeHidden, useIncomeHidden } from '@/hooks/use-income-hidden'

/** The eye toggle that shows or hides every income figure on this device. */
export function IncomeVisibilityToggle({ size = 'icon-sm' }: { size?: 'icon-sm' | 'icon' }) {
  const hidden = useIncomeHidden()
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={hidden}
      aria-label={hidden ? 'Show income figures' : 'Hide income figures'}
      title={hidden ? 'Show income figures' : 'Hide income figures'}
      onClick={() => setIncomeHidden(!hidden)}
    >
      {hidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
    </Button>
  )
}

/** An income amount, or ₦•••••• while income figures are hidden. */
export function IncomeAmount({
  minor,
  currency,
  prefix = '',
}: {
  minor: number
  currency: string
  /** E.g. "+" before received amounts. */
  prefix?: string
}) {
  const hidden = useIncomeHidden()
  if (hidden) {
    return <span aria-label="Hidden amount">{prefix}₦••••••</span>
  }
  return (
    <>
      {prefix}
      {formatMoney(minor, currency)}
    </>
  )
}
