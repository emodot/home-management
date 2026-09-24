import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from './constants.ts'

/** Largest amount accepted anywhere (matches the database check): ₦1 trillion. */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000

const digitsCache = new Map<string, number>()

/** Minor-unit digits for a currency (2 for NGN: 100 kobo = ₦1). */
export function minorDigits(currency: string = DEFAULT_CURRENCY): number {
  let digits = digitsCache.get(currency)
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    digitsCache.set(currency, digits)
  }
  return digits
}

/**
 * Parses a user-entered amount ("45,000", "₦1,200.50", "0.5") into integer minor units without
 * floating-point arithmetic. Throws RangeError for anything that isn't a plain decimal amount.
 */
export function toMinor(value: string | number, currency: string = DEFAULT_CURRENCY): number {
  const text = String(value)
    .trim()
    .replace(/[\s,₦]/g, '')
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) throw new RangeError(`Invalid amount: ${String(value)}`)

  const digits = minorDigits(currency)
  const [whole = '', fraction = ''] = text.split('.')
  if (fraction.length > digits) {
    throw new RangeError(`At most ${digits} decimal places`)
  }
  const minor = Number(whole || '0') * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0')
  if (!Number.isSafeInteger(minor)) throw new RangeError('Amount too large')
  return minor
}

/** Minor units back to a plain decimal string for editing: 4500050 → "45000.50", 4500000 → "45000". */
export function fromMinor(minor: number, currency: string = DEFAULT_CURRENCY): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Invalid minor amount: ${minor}`)
  const digits = minorDigits(currency)
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const unit = 10 ** digits
  const whole = Math.trunc(abs / unit)
  const fraction = abs % unit
  if (digits === 0 || fraction === 0) return `${sign}${whole}`
  return `${sign}${whole}.${String(fraction).padStart(digits, '0')}`
}

/** "₦45,000" for whole amounts, "₦45,000.50" otherwise. */
export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  const digits = minorDigits(currency)
  const whole = minor % 10 ** digits === 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
    // Intl accepts decimal strings exactly, so no float division is needed.
  }).format(fromMinor(minor, currency) as unknown as number)
}
