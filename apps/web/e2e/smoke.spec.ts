import { expect, test, type Page } from '@playwright/test'

// Local Supabase catches auth emails in Mailpit.
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324'

// A 1×1 PNG, attached as a receipt.
const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Waits for the sign-in email sent to `email` and returns its magic link. */
async function magicLinkFor(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`)
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json()) as {
      messages: { ID: string }[]
    }
    const id = search.messages[0]?.ID
    if (id) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
        HTML: string
      }
      const href = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(message.HTML)?.[1]
      if (href) return href.replaceAll('&amp;', '&')
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No sign-in email arrived for ${email}`)
}

async function choose(page: Page, fieldId: string, option: string) {
  await page.locator(`#${fieldId}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('sign up → household → expense with receipt → invite → task → complete → log expense', async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`

  await test.step('sign up with a magic link', async () => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in/)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await expect(page.getByText('Check your email')).toBeVisible()
    await page.goto(await magicLinkFor(email))
  })

  await test.step('create a household', async () => {
    await expect(page.getByText('Set up your household')).toBeVisible()
    await page.getByLabel('Your name').fill('Ada Obi')
    await page.getByLabel('Household name').fill('Obi home')
    await page.getByRole('button', { name: 'Create household' }).click()
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

  await test.step('invite a member', async () => {
    await page.goto('/members')
    await page.getByLabel('Email address').fill('bola@example.com')
    await page.getByRole('button', { name: 'Invite' }).click()
    await expect(page.getByText('Invite sent to bola@example.com')).toBeVisible()
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
  })
})
