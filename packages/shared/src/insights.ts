/** Share of a budget used at which it's flagged (amber). Over 100% is red. */
export const BUDGET_WARNING_RATIO = 0.8

export type BudgetLevel = 'ok' | 'warning' | 'over'

export interface BudgetStatus {
  level: BudgetLevel
  /** spent / budget, uncapped (1.25 = 25% over). */
  ratio: number
  /** Budget minus spent; negative when over. */
  remainingMinor: number
}

export function budgetStatus(spentMinor: number, budgetMinor: number): BudgetStatus {
  const ratio = budgetMinor > 0 ? spentMinor / budgetMinor : 0
  const level: BudgetLevel =
    spentMinor > budgetMinor ? 'over' : ratio >= BUDGET_WARNING_RATIO ? 'warning' : 'ok'
  return { level, ratio, remainingMinor: budgetMinor - spentMinor }
}

/** Percentage change from `previous` to `current`, or null when there's nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}
