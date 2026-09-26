import { expect, test, type Page } from '@playwright/test'

// A 1×1 PNG, attached as a receipt.
const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const PASSWORD = 'correct horse battery'
// Seeded by CI (see .github/workflows/ci.yml); super-admins create households.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'superadmin@example.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'super-admin-e2e'
const NEW_PASSWORD = 'battery staple horse'

async function choose(page: Page, fieldId: string, option: string) {
  await page.locator(`#${fieldId}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('super-admin creates a household → its admin joins → expense with receipt → invite → task → complete → log expense', async ({
  page,
  browser,
}) => {
  const email = `e2e-${Date.now()}@example.com`
  let adminInviteUrl = ''

  await test.step('a super-admin creates the household and a household admin invite', async () => {
    const context = await browser.newContext()
    const admin = await context.newPage()
    await admin.goto('/admin/sign-in')
    await admin.getByLabel('Email').fill(ADMIN_EMAIL)
    await admin.getByLabel('Password').fill(ADMIN_PASSWORD)
    await admin.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(admin.getByRole('heading', { name: 'Overview' })).toBeVisible()

    await admin.getByRole('link', { name: 'Households' }).click()
    await admin.getByRole('button', { name: 'Create household' }).click()
    await admin.getByLabel('Household name').fill('Obi home')
    await admin.getByRole('dialog').getByRole('button', { name: 'Create household' }).click()
    await expect(admin.getByRole('heading', { name: 'Obi home' })).toBeVisible()

    await admin.getByRole('button', { name: 'Create admin invite link' }).click()
    const link = admin.getByRole('dialog').getByLabel('Invite link')
    await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/)
    adminInviteUrl = await link.inputValue()
    await context.close()
  })

  await test.step('the household admin creates an account through the invite', async () => {
    await page.goto(adminInviteUrl)
    await expect(page.getByText('Create an account to join')).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('button', { name: 'Join household' }).click()
    await expect(page.getByText('Track your first expense')).toBeVisible()
  })

  await test.step('add an expense with a receipt', async () => {
    await page.goto('/expenses/new')
    await page.getByLabel('Amount').fill('45000')
    await page.getByLabel('What was it for?').fill('Water tanker')
    await choose(page, 'categoryId', 'Water')
    await page
      .locator('input[type="file"][multiple]')
      .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
    await expect(page.getByRole('button', { name: /^Remove receipt\./ })).toBeVisible()
    await page.getByRole('button', { name: 'Save expense' }).click()

    await page.getByRole('link', { name: /Water tanker/ }).click()
    await expect(page.getByRole('heading', { name: 'Water tanker' })).toBeVisible()
    // Receipts upload in the background after saving.
    await expect(page.getByRole('heading', { name: 'Receipts (1)' })).toBeVisible()
  })

  await test.step('invite members by email and by a shared link', async () => {
    await page.goto('/members')
    await page.getByLabel('Or email an invite').fill('bola@example.com')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Invite sent to bola@example.com')).toBeVisible()

    await page.getByRole('button', { name: 'Create invite link' }).click()
    const link = page.getByRole('dialog').getByLabel('Invite link')
    await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/)
    const inviteUrl = await link.inputValue()
    await page.keyboard.press('Escape')

    // Someone else opens the link in their own browser, creates an account and joins.
    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await guestPage.goto(inviteUrl)
    await expect(guestPage.getByText('Create an account to join')).toBeVisible()
    await guestPage.getByLabel('Email').fill(`guest-${email}`)
    await guestPage.getByLabel('Password').fill(PASSWORD)
    await guestPage.getByRole('button', { name: 'Create account' }).click()
    await guestPage.getByRole('button', { name: 'Join household' }).click()
    await expect(guestPage.getByText('Welcome to Obi home')).toBeVisible()
    // Members who aren't household admins can't invite.
    await guestPage.goto('/members')
    await expect(guestPage.getByText('Ask a household admin to invite them')).toBeVisible()
    await expect(guestPage.getByRole('button', { name: 'Create invite link' })).toHaveCount(0)
    await guest.close()

    await page.reload()
    await expect(page.getByText('2 members')).toBeVisible()
  })

  await test.step('create a task', async () => {
    await page.goto('/tasks/new')
    await page.getByLabel('Task', { exact: true }).fill('Service generator')
    await choose(page, 'defaultCategoryId', 'Fuel & Generator')
    await page.getByRole('button', { name: 'Add task' }).click()
    await expect(page.getByRole('heading', { name: 'Service generator' })).toBeVisible()
  })

  await test.step('complete it and log an expense', async () => {
    await page.getByRole('button', { name: 'Mark done' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mark done' }).click()
    await page.getByRole('button', { name: 'Log expense' }).click()

    await expect(page.getByText('For “Service generator”')).toBeVisible()
    await expect(page.getByLabel('What was it for?')).toHaveValue('Service generator')
    await page.getByLabel('Amount').fill('25000')
    await page.getByRole('button', { name: 'Save expense' }).click()

    // Back on the task, the completion lists the expense logged for it.
    await expect(page.getByRole('heading', { name: 'Service generator' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Service generator · ₦25,000/ })).toBeVisible()
  })

  await test.step('the activity feed shows what happened', async () => {
    await page.goto('/activity')
    await expect(page.getByText('You marked done')).toBeVisible()
    await expect(page.getByText('You invited bola@example.com')).toBeVisible()
    await expect(page.getByText('You added receipt')).toBeVisible()
    await expect(page.getByText('You added ₦45,000')).toBeVisible()
    await expect(page.getByText('You created an invite link')).toBeVisible()
    await expect(page.getByText('joined the household')).toHaveCount(2)
  })

  await test.step('update the profile and change the password', async () => {
    await page.goto('/profile')
    await page.getByLabel('Name', { exact: true }).fill('Ada O.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Name saved')).toBeVisible()

    await page.getByLabel('Current password').fill(PASSWORD)
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()
  })

  await test.step('sign out and back in with the new password', async () => {
    await page.goto('/more')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible()
  })
})
