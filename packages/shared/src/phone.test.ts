import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, telUrl, whatsappUrl } from './phone.ts'

describe('normalizePhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['0803-123-4567', '+2348031234567'],
    ['(0803) 123 4567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['+234 (0) 803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['002348031234567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['07012345678', '+2347012345678'],
    ['09151234567', '+2349151234567'],
    ['01 234 5678', '+23412345678'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it.each(['', 'abc', '0803', '0803 123 45', '0803123456789', '06031234567x', '+', '+0123'])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input)).toBeNull()
    },
  )
})

describe('phone links and display', () => {
  it('formats Nigerian mobiles for reading', () => {
    expect(formatPhone('+2348031234567')).toBe('+234 803 123 4567')
    expect(formatPhone('+442079460958')).toBe('+442079460958')
  })

  it('builds tel: and wa.me links', () => {
    expect(telUrl('+2348031234567')).toBe('tel:+2348031234567')
    expect(whatsappUrl('+2348031234567')).toBe('https://wa.me/2348031234567')
  })
})
