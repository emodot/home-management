import { describe, expect, it } from 'vitest'
import {
  byMealTime,
  formatWeek,
  householdSlots,
  isWeekStart,
  laterMeals,
  leftoversOf,
  potServings,
  weekDays,
  weekStartOf,
  type MealEntry,
} from './plan.ts'

const meal = (
  id: string,
  date: string,
  slot: MealEntry['slot'],
  servings: number | null,
  leftoverOf: string | null = null,
): MealEntry => ({
  id,
  planId: 'p1',
  date,
  slot,
  recipeId: 'r1',
  title: 'Egusi soup',
  servings,
  leftoverOf,
  cookedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
})

describe('weeks', () => {
  it('start on Sunday', () => {
    expect(weekStartOf('2026-10-14')).toBe('2026-10-11') // Wednesday
    expect(weekStartOf('2026-10-11')).toBe('2026-10-11') // Sunday
    expect(weekStartOf('2026-10-17')).toBe('2026-10-11') // Saturday
    expect(weekStartOf('2027-01-01')).toBe('2026-12-27')
    expect(isWeekStart('2026-10-11')).toBe(true)
    expect(isWeekStart('2026-10-12')).toBe(false)
    expect(isWeekStart('soon')).toBe(false)
  })

  it('have seven days', () => {
    expect(weekDays('2026-09-27')).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })

  it('read as a range', () => {
    expect(formatWeek('2026-10-11')).toBe('11–17 Oct 2026')
    expect(formatWeek('2026-09-27')).toBe('27 Sept – 3 Oct 2026')
  })
})

describe('householdSlots', () => {
  it("keeps the household's known slots in the day's order", () => {
    expect(householdSlots(['dinner', 'snack', 'breakfast'])).toEqual([
      'breakfast',
      'snack',
      'dinner',
    ])
    expect(householdSlots(['brunch'])).toEqual(['breakfast', 'lunch', 'dinner'])
  })
})

describe('batch cooking', () => {
  it('offers the later meals of the week', () => {
    const later = laterMeals('2026-10-16', 'lunch', ['breakfast', 'lunch', 'dinner'])
    expect(later).toEqual([
      { date: '2026-10-16', slot: 'dinner' },
      { date: '2026-10-17', slot: 'breakfast' },
      { date: '2026-10-17', slot: 'lunch' },
      { date: '2026-10-17', slot: 'dinner' },
    ])
  })

  it('counts everyone a pot feeds', () => {
    const pot = meal('a', '2026-10-11', 'dinner', 4)
    const meals = [
      pot,
      meal('c', '2026-10-13', 'lunch', 2, 'a'),
      meal('b', '2026-10-12', 'lunch', null, 'a'),
    ]
    expect(leftoversOf(pot, meals).map((m) => m.id)).toEqual(['b', 'c'])
    expect(potServings(pot, meals)).toBe(6)
    expect(potServings(meal('x', '2026-10-11', 'lunch', null), [])).toBeNull()
  })

  it('orders meals by when they are eaten', () => {
    const meals = [
      meal('d', '2026-10-12', 'dinner', 1),
      meal('b', '2026-10-12', 'breakfast', 1),
      meal('s', '2026-10-11', 'snack', 1),
    ]
    expect(meals.sort(byMealTime).map((m) => m.id)).toEqual(['s', 'b', 'd'])
  })
})
