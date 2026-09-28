import { describe, expect, it } from 'vitest'
import { parseReceiptText, vendorSearchTerm } from './receipt-parser.ts'

const today = '2026-09-28'
const parse = (text: string) => parseReceiptText(text, { today })

describe('parseReceiptText', () => {
  it('reads a supermarket receipt: TOTAL, not SUBTOTAL, VAT or cash', () => {
    expect(
      parse(`
        SHOPRITE LEKKI
        Admiralty Way, Lekki Phase 1
        Tel: 08031234567
        Date: 12/09/2026   Time: 14:32
        PEAK MILK 400G      2 x 3,250.00    6,500.00
        GOLDEN PENNY RICE 5KG             12,800.00
        SUBTOTAL                          19,300.00
        VAT 7.5%                           1,447.50
        TOTAL                             20,747.50
        CASH                              25,000.00
        CHANGE                             4,252.50
        Thank you for shopping with us
      `),
    ).toEqual({ amountMinor: 2_074_750, occurredOn: '2026-09-12', vendor: 'Shoprite Lekki' })
  })

  it('prefers GRAND TOTAL and reads month names', () => {
    const parsed = parse(`
      Welcome to
      Mama Put Kitchen
      12th Sep, 2026
      Jollof rice   2,500
      Chicken       3,000
      Total         5,500
      Service charge  550
      Grand Total   6,050
    `)
    expect(parsed).toEqual({
      amountMinor: 605_000,
      occurredOn: '2026-09-12',
      vendor: 'Mama Put Kitchen',
    })
  })

  it('reads a fuel station receipt with the amount on the next line', () => {
    expect(
      parse(`
        TOTAL ENERGIES
        Ajose Adeogun Street
        Pump 4  PMS
        Litres 45.00  Price 617.00
        AMOUNT
        ₦27,765.00
        2026-09-20 08:15
      `),
    ).toEqual({ amountMinor: 2_776_500, occurredOn: '2026-09-20', vendor: 'Total Energies' })
  })

  it('reads a POS slip', () => {
    expect(
      parse(`
        MONIEPOINT
        MERCHANT: ADE & SONS PROVISIONS
        TERMINAL ID 2KMP1234
        DATE: 03-09-26 TIME: 18:02:11
        CARD: 539983******1234
        AMOUNT: NGN 5,000.00
        APPROVED
      `),
    ).toEqual({ amountMinor: 500_000, occurredOn: '2026-09-03', vendor: 'Ade & Sons Provisions' })
  })

  it('reads a bank transfer receipt: the beneficiary is the vendor', () => {
    expect(
      parse(`
        Transaction Receipt
        Transfer Successful
        Amount
        ₦25,000.00
        Fee ₦10.75
        Beneficiary Name
        CHUKWUDI OKAFOR | 0123456789 Opay
        Transaction Date Sep 21, 2026 10:45
        Reference 100004260921104512345678
      `),
    ).toEqual({ amountMinor: 2_500_000, occurredOn: '2026-09-21', vendor: 'Chukwudi Okafor' })
  })

  it('fixes digits OCR misread as letters', () => {
    expect(parse('GENERATOR REPAIRS\nTOTAL 45,O00.0O').amountMinor).toBe(4_500_000)
    expect(parse('Total 1l,5S0').amountMinor).toBe(1_155_000)
  })

  it('reads day first, unless the second number cannot be a month', () => {
    expect(parse('Date 05/09/2026').occurredOn).toBe('2026-09-05')
    expect(parse('Date 09/25/2026').occurredOn).toBe('2026-09-25')
  })

  it('ignores future, impossible and very old dates', () => {
    expect(parse('Date 12/10/2026').occurredOn).toBeNull() // 12 Oct, after today
    expect(parse('Date 31/02/2026').occurredOn).toBeNull()
    expect(parse('Date 12/09/2019').occurredOn).toBeNull()
    expect(parse('Printed 01/01/2031\nDate 14/09/2026').occurredOn).toBe('2026-09-14')
  })

  it('falls back to the largest money-looking amount, not phone numbers or plain numbers', () => {
    expect(
      parse(`
        Iya Bisi Foodstuff
        08012345678
        Beans 3 derica  4,500
        Garri           2,000.00
        Invoice No 20260
      `).amountMinor,
    ).toBe(450_000)
  })

  it('returns nulls for unreadable text', () => {
    expect(parse('~~ ;; ,, \n ||| 7 ..')).toEqual({
      amountMinor: null,
      occurredOn: null,
      vendor: null,
    })
    expect(parse('')).toEqual({ amountMinor: null, occurredOn: null, vendor: null })
  })

  it('skips receipt headings when looking for the business name', () => {
    expect(parse('CUSTOMER COPY\n*** RECEIPT ***\n12 Allen Avenue\nChicken Republic').vendor).toBe(
      'Chicken Republic',
    )
  })
})

describe('vendorSearchTerm', () => {
  it('picks the first distinctive word', () => {
    expect(vendorSearchTerm('Shoprite Lekki')).toBe('shoprite')
    expect(vendorSearchTerm('The Ade Stores Ltd')).toBe('ade')
    expect(vendorSearchTerm('Supermarket Limited')).toBeNull()
  })
})
