import { describe, expect, it } from 'vitest'
import { likelyDuplicates } from './catalog.ts'
import { normalizeItemName } from './normalize.ts'

const item = (name: string) => ({ id: name, name, normalizedName: normalizeItemName(name) })
const names = (pairs: [{ name: string }, { name: string }][]) =>
  pairs.map(([a, b]) => `${a.name} / ${b.name}`)

describe('likelyDuplicates', () => {
  it('pairs the same words in another order', () => {
    expect(
      names(likelyDuplicates([item('Ofada rice'), item('Rice (ofada)'), item('Rice')])),
    ).toEqual(['Ofada rice / Rice (ofada)'])
  })

  it('pairs plurals anywhere in the name', () => {
    expect(names(likelyDuplicates([item('Eggs (crate)'), item('Crate egg')]))).toEqual([
      'Crate egg / Eggs (crate)',
    ])
  })

  it('pairs one-letter typos in longer names only', () => {
    expect(
      names(
        likelyDuplicates([item('Tomato paste'), item('Tomatoe paste'), item('Rice'), item('Mice')]),
      ),
    ).toEqual(['Tomato paste / Tomatoe paste'])
  })

  it('leaves different items alone', () => {
    expect(
      likelyDuplicates([item('Rice'), item('Brown rice'), item('Palm oil'), item('Groundnut oil')]),
    ).toEqual([])
  })
})
