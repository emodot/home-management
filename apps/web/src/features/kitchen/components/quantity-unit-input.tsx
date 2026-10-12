import { KITCHEN_UNITS, unitLabel, type KitchenUnit } from '@home/shared'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** A quantity with its unit (pieces, kg, mudu, paint bucket…), side by side. */
export function QuantityUnitInput({
  id,
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
  invalid,
  placeholder,
}: {
  id?: string
  quantity: string
  unit: KitchenUnit
  onQuantityChange: (value: string) => void
  onUnitChange: (unit: KitchenUnit) => void
  invalid?: boolean
  placeholder?: string
}) {
  const count = Number(quantity.replace(',', '.'))
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        aria-label="Quantity"
        aria-invalid={invalid}
        className="tabular-nums"
        placeholder={placeholder}
        value={quantity}
        onChange={(e) => onQuantityChange(e.target.value)}
      />
      <Select value={unit} onValueChange={(value) => onUnitChange(value as KitchenUnit)}>
        <SelectTrigger className="w-full" aria-label="Unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KITCHEN_UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {unitLabel(u, Number.isFinite(count) ? count : 2)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
