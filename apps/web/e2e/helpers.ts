import { expect, type Browser, type Page, type Request } from '@playwright/test'

export const PASSWORD = 'correct horse battery'
// Seeded by CI (see .github/workflows/ci.yml); super-admins create households.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'superadmin@example.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'super-admin-e2e'

/** A super-admin creates a household and returns the link that makes someone its admin. */
export async function createHouseholdWithAdminInvite(browser: Browser, name: string) {
  const context = await browser.newContext()
  const admin = await context.newPage()
  await admin.goto('/admin/sign-in')
  await admin.getByLabel('Email').fill(ADMIN_EMAIL)
  await admin.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await admin.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible()

  await admin.getByRole('link', { name: 'Households' }).click()
  await admin.getByRole('button', { name: 'Create household' }).click()
  await admin.getByLabel('Household name').fill(name)
  await admin.getByRole('dialog').getByRole('button', { name: 'Create household' }).click()
  await expect(admin.getByRole('heading', { name })).toBeVisible()

  await admin.getByRole('button', { name: 'Create admin invite link' }).click()
  const link = admin.getByRole('dialog').getByLabel('Invite link')
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/)
  const inviteUrl = await link.inputValue()
  await context.close()
  return inviteUrl
}

/** Creates an account through an invite and joins the household (landing on Expenses). */
export async function joinThroughInvite(page: Page, inviteUrl: string, email: string) {
  await page.goto(inviteUrl)
  await expect(page.getByText('Create an account to join')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Join household' }).click()
}

/**
 * Marks tours as seen for the signed-in user, through the API the app itself called in `request`
 * (its address and the user's token), so they don't pop up over the steps that follow.
 */
export async function markToursSeen(
  page: Page,
  request: Request,
  tours: { id: string; version: number }[],
) {
  const headers = await request.allHeaders()
  for (const tour of tours) {
    const response = await page.request.post(
      `${new URL(request.url()).origin}/rest/v1/rpc/mark_onboarding`,
      {
        headers: { apikey: headers.apikey ?? '', authorization: headers.authorization ?? '' },
        data: {
          p_key: `tour:${tour.id}`,
          p_version: tour.version,
          p_status: 'dismissed',
          p_last_step: 0,
        },
      },
    )
    expect(response.ok()).toBe(true)
  }
}

/** Resolves once the app has loaded the user's onboarding progress (after a load or reload). */
export function onboardingLoaded(page: Page) {
  return page.waitForResponse((r) => r.url().includes('/rest/v1/user_onboarding'))
}
