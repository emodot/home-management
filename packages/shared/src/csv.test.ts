import { describe, expect, it } from 'vitest'
import { toCsv } from './csv.ts'

const body = (csv: string) => csv.replace(/^\uFEFF/, '')

describe('toCsv', () => {
  it('writes rows with CRLF and a BOM', () => {
    const csv = toCsv([
      ['a', 'b'],
      [1, null],
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(body(csv)).toBe('a,b\r\n1,\r\n')
  })

  it('quotes commas, quotes and newlines', () => {
    expect(body(toCsv([['Diesel, 50L', 'said "hi"', 'two\nlines', ' padded ']]))).toBe(
      '"Diesel, 50L","said ""hi""","two\nlines"," padded "\r\n',
    )
  })

  it('neutralises spreadsheet formulas in text but not numbers', () => {
    expect(body(toCsv([['=HYPERLINK("x")', '+1', '-rent', '@sum', 'ok', -5]]))).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-rent,'@sum,ok,-5\r\n`,
    )
  })
})
