import { DEFAULT_LOCALE, fromMinor, toMinor } from '@home/shared'

/** Minor units → an amount-field value with thousands separators: 4500050 → "45,000.50". */
export function formatAmountInput(minor: number): string {
  const [whole = '0', fraction] = fromMinor(minor).split('.')
  const grouped = new Intl.NumberFormat(DEFAULT_LOCALE).format(BigInt(whole))
  return fraction ? `${grouped}.${fraction}` : grouped
}

/** Re-formats whatever was typed, if it parses ("45000" → "45,000"); otherwise leaves it alone. */
export function tidyAmountInput(value: string): string {
  try {
    return formatAmountInput(toMinor(value))
  } catch {
    return value
  }
}
