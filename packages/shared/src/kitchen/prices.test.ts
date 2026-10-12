import { describe, expect, it } from 'vitest'
import {
  cheapestRecentStore,
  inMainUnits,
  inUnit,
  mainUnit,
  priceSeries,
  sortPriceSummaries,
  summarizePrices,
  type PricePoint,
} from './prices.ts'

let n = 0
const p = (
  name: string,
  boughtOn: string,
  unitPriceMinor: number,
  store: string | null = 'Mile 12',
  unit: PricePoint['unit'] = 'kg',
): PricePoint => ({
  id: `p${++n}`,
  itemId: name.toLowerCase(),
  name,
  boughtOn,
  quantity: 1,
  unit,
  priceMinor: unitPriceMinor,
  unitPriceMinor,
  storeTag: store,
  createdAt: `${boughtOn}T10:00:${String(n).padStart(2, '0')}Z`,
})

describe('summarizePrices', () => {
  it('compares the latest per-unit price with the one before in the same unit', () => {
    const [rice] = summarizePrices([
      p('Rice', '2026-09-01', 100000),
      p('Rice', '2026-10-01', 120000),
      p('Rice', '2026-09-20', 5000000, 'Shoprite', 'bag'),
    ])
    expect(rice?.latest.boughtOn).toBe('2026-10-01')
    expect(rice?.previous?.boughtOn).toBe('2026-09-01')
    expect(rice?.change).toBeCloseTo(0.2)
    expect(rice?.purchases).toBe(3)
  })

  it('has no change for a first purchase', () => {
    expect(summarizePrices([p('Salt', '2026-10-01', 40000)])[0]?.change).toBeNull()
  })
})

describe('sortPriceSummaries', () => {
  const summaries = summarizePrices([
    p('Beans', '2026-09-01', 100000),
    p('Beans', '2026-10-01', 110000), // +10%
    p('Oil', '2026-09-01', 100000),
    p('Oil', '2026-09-15', 150000), // +50%
    p('Garri', '2026-10-05', 50000), // new
    p('Yam', '2026-09-01', 100000),
    p('Yam', '2026-10-02', 90000), // -10%
  ])
  const names = (sort: Parameters<typeof sortPriceSummaries>[1]) =>
    sortPriceSummaries(summaries, sort).map((s) => s.name)

  it('puts the biggest increase first and unknown changes last', () => {
    expect(names('increase')).toEqual(['Oil', 'Beans', 'Yam', 'Garri'])
  })

  it('sorts by most recent purchase, or by name', () => {
    expect(names('recent')).toEqual(['Garri', 'Yam', 'Beans', 'Oil'])
    expect(names('name')).toEqual(['Beans', 'Garri', 'Oil', 'Yam'])
  })
})

describe('cheapestRecentStore', () => {
  it("uses each store's latest recent price in the unit", () => {
    const points = [
      p('Rice', '2026-10-01', 130000, 'Shoprite'),
      p('Rice', '2026-08-01', 90000, 'Shoprite'), // older Shoprite price doesn't count
      p('Rice', '2026-09-25', 120000, 'Mile 12'),
      p('Rice', '2026-05-01', 80000, 'Oyingbo'), // too long ago
      p('Rice', '2026-10-02', 10000, 'Spar', 'bag'), // other unit
    ]
    expect(cheapestRecentStore(points, 'kg', '2026-10-10')).toEqual({
      store: 'Mile 12',
      unitPriceMinor: 120000,
    })
  })

  it('needs two stores to compare', () => {
    expect(cheapestRecentStore([p('Rice', '2026-10-01', 1)], 'kg', '2026-10-10')).toBeNull()
  })
})

describe('priceSeries', () => {
  it('makes a line per store in the unit, oldest first, most-used stores first', () => {
    const { series, otherStores, otherUnits } = priceSeries(
      [
        p('Rice', '2026-10-01', 120000, 'Mile 12'),
        p('Rice', '2026-09-01', 100000, 'Mile 12'),
        p('Rice', '2026-09-15', 110000, 'Shoprite'),
        p('Rice', '2026-09-20', 115000, null),
        p('Rice', '2026-09-20', 5000000, 'Spar', 'bag'),
      ],
      'kg',
    )
    expect(series.map((s) => s.store)).toEqual(['Mile 12', 'Shoprite', null])
    expect(series[0]?.points.map((x) => x.date)).toEqual(['2026-09-01', '2026-10-01'])
    expect([otherStores, otherUnits]).toEqual([0, 1])
  })

  it('leaves stores past the fourth to the table', () => {
    const points = ['A', 'B', 'C', 'D', 'E'].map((s) => p('Rice', '2026-10-01', 1, s))
    expect(priceSeries(points, 'kg').otherStores).toBe(1)
  })
})

describe('mainUnit', () => {
  it('is the unit bought most often, the latest on a tie', () => {
    expect(
      mainUnit([
        p('Chicken', '2026-09-01', 1),
        p('Chicken', '2026-09-20', 1),
        p('Chicken', '2026-10-01', 1, 'Spar', 'pack'),
      ]),
    ).toBe('kg')
    expect(mainUnit([p('Rice', '2026-09-01', 1), p('Rice', '2026-10-01', 1, null, 'bag')])).toBe(
      'bag',
    )
    expect(mainUnit([])).toBeNull()
  })
})

describe('inUnit', () => {
  it("restates purchases in other units through the item's conversions", () => {
    const bag = p('Rice', '2026-10-01', 7000000, 'Mile 12', 'bag')
    const kg = p('Rice', '2026-10-05', 150000)
    const tin = p('Rice', '2026-10-06', 90000, 'Mile 12', 'tin')
    const [b, k, t] = inUnit([bag, kg, tin], 'kg', [{ unit: 'bag', factor: 50, toUnit: 'kg' }])
    expect(b).toMatchObject({
      unit: 'kg',
      quantity: 50,
      priceMinor: 7000000,
      unitPriceMinor: 140000,
    })
    expect(k).toBe(kg)
    expect(t).toBe(tin)
  })

  it('converts metric without any conversions', () => {
    const [g] = inUnit(
      [{ ...p('Pepper', '2026-10-01', 0, null, 'g'), quantity: 500, priceMinor: 100000 }],
      'kg',
      [],
    )
    expect(g).toMatchObject({ unit: 'kg', quantity: 0.5, unitPriceMinor: 200000 })
  })
})

describe('inMainUnits', () => {
  it("restates each item's purchases in its usual unit through its own conversions", () => {
    const bags = [
      p('Rice', '2026-09-01', 8000000, 'Mile 12', 'bag'),
      p('Rice', '2026-10-01', 8500000, 'Mile 12', 'bag'),
    ]
    const kg = { ...p('Rice', '2026-09-20', 0), quantity: 5, priceMinor: 1000000 }
    const beans = p('Beans', '2026-09-20', 120000, 'Mile 12', 'bag')
    const out = inMainUnits(
      [...bags, kg, beans],
      [
        { itemId: 'rice', unit: 'bag', factor: 50, toUnit: 'kg' },
        { itemId: 'beans', unit: 'bag', factor: 100, toUnit: 'kg' },
      ],
    )
    expect(out.map((x) => [x.name, x.unit, x.unitPriceMinor])).toEqual([
      ['Rice', 'bag', 8000000],
      ['Rice', 'bag', 8500000],
      ['Rice', 'bag', 10000000],
      ['Beans', 'bag', 120000],
    ])
  })
})
