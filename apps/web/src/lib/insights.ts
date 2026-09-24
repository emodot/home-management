/** The dashboard month from `?month=YYYY-MM`, defaulting to (and capped at) the current month. */
export function selectedMonth(param: string | null, today: string): string {
  const current = today.slice(0, 7)
  if (!param || !/^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return current
  return param > current ? current : param
}
