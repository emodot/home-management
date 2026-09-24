/**
 * Phone numbers are stored in E.164 (+2348031234567). Input is assumed Nigerian unless it starts
 * with + or 00 and another country code.
 */

const NIGERIA = '234'
// Nigerian mobile numbers: 070x/080x/081x/090x/091x… → 10-digit national number.
const NG_MOBILE = /^[789][01]\d{8}$/
// Landlines (e.g. Lagos 01 234 5678) have shorter national numbers.
const NG_LANDLINE = /^[1-9]\d{6,8}$/

/** E.164 for a typed number, or null if it can't be a real number. */
export function normalizePhone(input: string): string | null {
  let digits = input.trim().replace(/[\s().-]/g, '')
  if (digits === '') return null

  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (digits.startsWith('+')) {
    const rest = digits.slice(1)
    if (!/^\d+$/.test(rest)) return null
    if (!rest.startsWith(NIGERIA)) return /^[1-9]\d{7,14}$/.test(rest) ? `+${rest}` : null
    digits = rest
  }
  if (!/^\d+$/.test(digits)) return null

  let national: string
  if (digits.startsWith(NIGERIA) && digits.length > 10) {
    national = digits.slice(NIGERIA.length).replace(/^0/, '') // "+234 (0) 803…"
  } else if (digits.startsWith('0')) {
    national = digits.slice(1)
  } else {
    national = digits // "803 123 4567"
  }
  // A mobile prefix (70/80/81/90/91…) means it must be a full mobile number, not a short landline.
  const valid = /^[789][01]/.test(national) ? NG_MOBILE.test(national) : NG_LANDLINE.test(national)
  return valid ? `+${NIGERIA}${national}` : null
}

/** "+234 803 123 4567" for Nigerian mobiles; other numbers are shown as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+234([789][01]\d)(\d{3})(\d{4})$/.exec(e164)
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : e164
}

export function telUrl(e164: string): string {
  return `tel:${e164}`
}

/** WhatsApp click-to-chat link: https://wa.me/2348031234567 */
export function whatsappUrl(e164: string): string {
  return `https://wa.me/${e164.replace(/^\+/, '')}`
}
