const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** The dashboard month from `?month=YYYY-MM`, defaulting to (and capped at) the current month. */
export function selectedMonth(param: string | null, today: string): string {
  const current = today.slice(0, 7)
  if (!param || !MONTH.test(param)) return current
  return param > current ? current : param
}

/** The Budgets page month from `?month=YYYY-MM`, any month, defaulting to the current one. */
export function budgetMonthParam(param: string | null, today: string): string {
  return param && MONTH.test(param) ? param : today.slice(0, 7)
}
