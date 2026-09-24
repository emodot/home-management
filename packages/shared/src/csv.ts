export type CsvValue = string | number | null | undefined

// Cells a spreadsheet would treat as a formula (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

/** RFC 4180 CSV (CRLF line endings), with a UTF-8 BOM so Excel reads ₦ and accents correctly. */
export function toCsv(rows: CsvValue[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
