import { formatPhone, normalizePhone } from '@home/shared'

// The Contact Picker API (Chrome on Android). Not in TypeScript's DOM types yet.
type ContactProperty = 'name' | 'tel' | 'email'
interface ContactInfo {
  name?: string[]
  tel?: string[]
  email?: string[]
}
interface ContactsManager {
  getProperties?: () => Promise<ContactProperty[]>
  select: (
    properties: ContactProperty[],
    options?: { multiple?: boolean },
  ) => Promise<ContactInfo[]>
}

function contactsManager(): ContactsManager | null {
  const manager = (navigator as Navigator & { contacts?: ContactsManager }).contacts
  return manager && 'ContactsManager' in window ? manager : null
}

/** Whether this browser lets the page pick from the phone's contacts (iPhones and desktops don't). */
export function canPickContacts(): boolean {
  return contactsManager() !== null
}

export interface PickedContact {
  name: string | null
  /** As the person would type it, e.g. "0803 123 4567"; the form normalises it. */
  phone: string | null
  email: string | null
}

/** Opens the phone's contact picker for one contact. Resolves to null if they cancel. */
export async function pickContact(): Promise<PickedContact | null> {
  const manager = contactsManager()
  if (!manager) return null
  const supported = (await manager.getProperties?.()) ?? ['name', 'tel', 'email']
  const wanted = (['name', 'tel', 'email'] as const).filter((p) => supported.includes(p))
  const [contact] = await manager.select(wanted, { multiple: false })
  if (!contact) return null

  const rawPhone = contact.tel?.find((t) => t.trim())?.trim() ?? null
  const phone = rawPhone ? normalizePhone(rawPhone) : null
  return {
    name:
      contact.name
        ?.find((n) => n.trim())
        ?.trim()
        .slice(0, 100) ?? null,
    phone: phone ? formatPhone(phone) : rawPhone,
    email: contact.email?.find((e) => e.trim())?.trim() ?? null,
  }
}
