import { describe, expect, it } from 'vitest'
import { batchDuplicates } from './receipt-batch.ts'

describe('batchDuplicates', () => {
  const logged = { id: 'x', amountMinor: 1250000, occurredOn: '2026-09-12' }

  it('flags entries matching a logged expense', () => {
    expect(
      batchDuplicates(
        [
          { amountMinor: 1250000, occurredOn: '2026-09-12' },
          { amountMinor: 1250000, occurredOn: '2026-09-13' },
        ],
        [logged],
      ),
    ).toEqual([{ kind: 'existing', expense: logged }, null])
  })

  it('flags the later of two matching entries in the batch', () => {
    expect(
      batchDuplicates(
        [
          { amountMinor: 500000, occurredOn: '2026-09-01' },
          { amountMinor: 700000, occurredOn: '2026-09-01' },
          { amountMinor: 500000, occurredOn: '2026-09-01' },
          { amountMinor: 500000, occurredOn: '2026-09-01' },
        ],
        [],
      ),
    ).toEqual([null, null, { kind: 'batch', index: 0 }, { kind: 'batch', index: 0 }])
  })

  it('ignores entries without an amount or date', () => {
    expect(
      batchDuplicates(
        [
          { amountMinor: null, occurredOn: '2026-09-12' },
          { amountMinor: null, occurredOn: '2026-09-12' },
          { amountMinor: 1250000, occurredOn: null },
        ],
        [logged],
      ),
    ).toEqual([null, null, null])
  })
})
