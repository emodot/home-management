import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// A 1×1 PNG, attached as a receipt.
const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** A one-page PDF with a text layer, like an emailed e-receipt: one line of text per entry. */
function textPdf(lines: string[]): Buffer {
  const stream = `BT /F1 14 Tf 18 TL 50 780 Td ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

const PASSWORD = 'correct horse battery'
// Seeded by CI (see .github/workflows/ci.yml); super-admins create households.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'superadmin@example.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'super-admin-e2e'
const NEW_PASSWORD = 'battery staple horse'

async function choose(page: Page, fieldId: string, option: string) {
  await page.locator(`#${fieldId}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('super-admin creates a household → its admin joins → expense with receipt → invite → task → complete → scan a receipt to log the expense → scan several at once → shared shopping list → shopping offline → finish shopping → pantry low stock → price history → cooking gas', async ({
  page,
  browser,
}) => {
  const email = `e2e-${Date.now()}@example.com`
  let adminInviteUrl = ''
  // A second member, kept signed in for the shared shopping list.
  let guest!: BrowserContext
  let guestPage!: Page

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
      .getByLabel('Receipts to attach')
      .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
    await expect(page.getByRole('button', { name: /^Remove receipt\./ })).toBeVisible()
    await page.getByRole('button', { name: 'Save expense' }).click()

    await page.getByRole('link', { name: /Water tanker/ }).click()
    await expect(page.getByRole('heading', { name: 'Water tanker' })).toBeVisible()
    // Receipts upload in the background after saving.
    await expect(page.getByRole('heading', { name: 'Receipts (1)' })).toBeVisible()
  })

  await test.step('record income and see the net for the month', async () => {
    await page.goto('/income/new')
    await page.getByLabel('Amount').fill('500000')
    await page.getByLabel('Where did it come from?').fill('Salary')
    await page.getByRole('button', { name: 'Save income' }).click()
    await expect(page.getByText('Income added')).toBeVisible()
    // ₦500,000 income less the ₦45,000 water tanker.
    await expect(page.getByText('₦455,000')).toBeVisible()
    await page.goto('/insights')
    await expect(page.getByText('Net (income − spent)')).toBeVisible()
    await expect(page.getByText('₦455,000')).toBeVisible()
    // The eye toggle hides every income figure.
    await page.getByRole('button', { name: 'Hide income figures' }).click()
    await expect(page.getByText('₦455,000')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show income figures' }).click()
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
    guest = await browser.newContext()
    guestPage = await guest.newPage()
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

    await page.reload()
    await expect(page.getByText('2 members')).toBeVisible()
  })

  await test.step('the shopping list is shared live between members', async () => {
    await page.goto('/kitchen/list')
    await guestPage.goto('/kitchen/list')
    await expect(guestPage.getByText('Your list is empty')).toBeVisible()

    // A new item goes into the catalogue and onto the list…
    const quickAdd = page.getByLabel('Add to the list')
    await quickAdd.fill('Tomatoes')
    await page.getByRole('option', { name: 'Add “Tomatoes”' }).click()
    await expect(page.getByLabel('Bought Tomatoes')).toBeVisible()
    // …and the other member sees it without reloading, then checks it off.
    await expect(guestPage.getByLabel('Bought Tomatoes')).toBeVisible()
    await guestPage.getByLabel('Bought Tomatoes').check()
    await expect(page.getByLabel('Bought Tomatoes')).toBeChecked()

    // Adding it again puts the same entry back rather than a second one.
    await quickAdd.fill('tomato')
    await page.getByRole('option', { name: /^Tomatoes/ }).click()
    await expect(page.getByText('Tomatoes is back on the list')).toBeVisible()
    await expect(guestPage.getByLabel('Bought Tomatoes')).not.toBeChecked()
    await expect(page.getByLabel(/^Bought /)).toHaveCount(1)

    // Shopping mode keeps working without signal and catches up when it's back.
    await page.getByRole('link', { name: 'Start shopping' }).click()
    await expect(page.getByRole('heading', { name: 'Shopping' })).toBeVisible()
    await page.context().setOffline(true)
    await page.getByLabel('Bought Tomatoes').click()
    await page.getByLabel('Price paid').fill('2500')
    await page.getByRole('button', { name: 'Save price' }).click()
    await expect(page.getByText(/^Offline\. 2 changes will sync/)).toBeVisible()
    await expect(page.getByText('₦2,500').first()).toBeVisible()
    await page.context().setOffline(false)
    await expect(page.getByText(/^(Offline|Syncing)/)).toHaveCount(0)
    // The other member sees it bought.
    await expect(guestPage.getByLabel('Bought Tomatoes')).toBeChecked()

    // Finishing turns the trip into an expense and clears what was bought from the list.
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await expect(page.getByLabel('Total paid')).toHaveValue('2,500')
    await page.getByRole('button', { name: 'Add ₦2,500 to expenses' }).click()
    await expect(page.getByText('₦2,500 added to expenses')).toBeVisible()
    await expect(guestPage.getByText('Your list is empty')).toBeVisible()
    await guest.close()
  })

  await test.step('the pantry: running low puts an item on the list, once', async () => {
    // The trip put 1 piece of tomatoes in the pantry.
    await page.goto('/kitchen/pantry')
    await page.getByRole('link', { name: /^Tomatoes/ }).click()
    await page.getByLabel('Running low at (optional)').fill('1')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByText("Tomatoes is running low, so it's on the shopping list"),
    ).toBeVisible()

    // Using the last one doesn't add it again.
    await page.goto('/kitchen/pantry')
    const saved = page.waitForResponse(
      (r) => r.url().includes('/pantry_items') && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'One less Tomatoes' }).click()
    await saved
    await expect(page.getByText('Out', { exact: true })).toBeVisible()
    await page.goto('/kitchen/list')
    await expect(page.getByLabel(/^Bought /)).toHaveCount(1)
    await expect(page.getByText(/from pantry/)).toBeVisible()
  })

  await test.step('prices: a second trip shows how the price moved', async () => {
    // Running low put tomatoes back on the list; buy them again, dearer.
    await page.goto('/kitchen/list/shop')
    await page.getByLabel('Bought Tomatoes').click()
    await page.getByLabel('Price paid').fill('3000')
    await page.getByRole('button', { name: 'Save price' }).click()
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await page.getByRole('button', { name: 'Add ₦3,000 to expenses' }).click()
    await expect(page.getByText('₦3,000 added to expenses')).toBeVisible()

    await page.goto('/kitchen/prices')
    const tomatoes = page.getByRole('link', { name: /^Tomatoes/ })
    await expect(tomatoes).toContainText('₦3,000')
    await expect(tomatoes).toContainText('20%')
    await tomatoes.click()
    await expect(page.getByRole('group', { name: 'Price per piece' })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('₦2,500')
  })

  await test.step('cooking gas: two refills predict the next one, with a reminder task', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
    await page.goto('/kitchen/gas')
    await expect(page.getByText('Log your last refill to start tracking')).toBeVisible()
    await page.getByLabel('Refilled on').fill(daysAgo(40))
    await page.getByLabel('Amount paid').fill('18000')
    await page.getByRole('button', { name: 'Log refill' }).click()
    await expect(page.getByText(/^Last refilled/)).toBeVisible()

    // A second refill today: 12.5 kg lasted about 40 days, so about 40 days left.
    await page.getByRole('button', { name: 'Log a refill' }).click()
    await page.getByLabel('Amount paid').fill('19000')
    await page.getByRole('button', { name: 'Log refill' }).click()
    await expect(page.getByText(/Reminder set for/)).toBeVisible()
    await expect(page.getByText(/^4\d days left$/)).toBeVisible()
    await page.goto('/tasks')
    await expect(page.getByText('Refill cooking gas')).toBeVisible()
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
    // Scanning the receipt fills in the amount but keeps the task's title.
    await page.getByLabel('Receipt to scan').setInputFiles({
      name: 'generator-receipt.pdf',
      mimeType: 'application/pdf',
      buffer: textPdf([
        'KUNLE GENERATOR SERVICES',
        'Servicing and oil change',
        'TOTAL NGN 25,000.00',
      ]),
    })
    await expect(page.getByLabel('Amount')).toHaveValue('25,000')
    await expect(page.getByLabel('What was it for?')).toHaveValue('Service generator')
    await expect(page.getByText('Filled in the amount from the receipt')).toBeVisible()
    await page.getByRole('button', { name: 'Save expense' }).click()

    // Back on the task, the completion lists the expense logged for it.
    await expect(page.getByRole('heading', { name: 'Service generator' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Service generator · ₦25,000/ })).toBeVisible()
  })

  await test.step('scanning several receipts at once adds an expense for each', async () => {
    await page.goto('/expenses/new')
    await page.getByLabel('Receipts to scan').setInputFiles([
      {
        name: 'aquafresh.pdf',
        mimeType: 'application/pdf',
        buffer: textPdf(['AQUAFRESH DELIVERIES', 'Date: 03/09/2026', 'TOTAL NGN 6,000.00']),
      },
      {
        name: 'kobo-gas.pdf',
        mimeType: 'application/pdf',
        buffer: textPdf(['KOBO GAS REFILL', 'Date: 04/09/2026', 'TOTAL NGN 12,500.00']),
      },
    ])
    await expect(page.getByRole('heading', { name: 'Add expenses from receipts' })).toBeVisible()
    await expect(page.getByLabel('Amount, receipt 1')).toHaveValue('6,000')
    await expect(page.getByLabel('Amount, receipt 2')).toHaveValue('12,500')

    // Nothing is saved until every receipt has its details.
    await page.getByRole('button', { name: 'Save 2 expenses' }).click()
    await expect(page.getByText('2 receipts still need details.')).toBeVisible()
    for (const [receipt, category] of [
      [1, 'Water'],
      [2, 'Fuel & Generator'],
    ] as const) {
      await page.getByLabel(`Category, receipt ${receipt}`).click()
      await page.getByRole('option', { name: category, exact: true }).click()
    }
    await page.getByRole('button', { name: 'Save 2 expenses' }).click()
    await expect(page.getByText('Added 2 expenses')).toBeVisible()
    await expect(page.getByText('2 receipts uploaded')).toBeVisible()
  })

  await test.step('the activity feed shows what happened', async () => {
    await page.goto('/activity')
    await expect(page.getByText('You marked done')).toBeVisible()
    await expect(page.getByText('You invited bola@example.com')).toBeVisible()
    await expect(page.getByText('You added receipt receipt.png')).toBeVisible()
    await expect(page.getByText('You added receipt generator-receipt.pdf')).toBeVisible()
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
