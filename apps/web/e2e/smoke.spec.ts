import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'
import { MODULE_TOURS } from '../src/features/onboarding/tours/modules'

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

/**
 * Marks tours as seen for the signed-in user, through the API the app itself called in `request`
 * (its address and the user's token), so they don't pop up over the steps that follow.
 */
async function markToursSeen(
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

async function choose(page: Page, fieldId: string, option: string) {
  await page.locator(`#${fieldId}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('super-admin creates a household → its admin joins → welcome tour, skipped once → the Expenses tour after it → getting-started checklist → expense with receipt → invite → task → complete → scan a receipt to log the expense → scan several at once → shared shopping list → shopping offline → finish shopping → pantry low stock → price history → merge duplicate items → a recipe scaled up → its missing ingredients onto the list → a week of meals, batch cooked → the week onto the list → cooked it, and the week against the budget → cooking gas', async ({
  page,
  browser,
}) => {
  // One long walk through the app, a step per feature; well past the default minute now.
  test.setTimeout(240_000)
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
    await admin.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
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
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('button', { name: 'Join household' }).click()
    await expect(page.getByText('Track your first expense')).toBeVisible()
  })

  await test.step('the welcome tour shows once, and skipping it is remembered', async () => {
    const welcome = page.getByRole('dialog', { name: 'Welcome to Lintel' })
    await welcome.getByRole('button', { name: 'Next' }).click()
    const expenses = page.getByRole('dialog', { name: 'Expenses' })
    await expect(expenses).toContainText('This is your home screen.')
    await expenses.getByRole('button', { name: 'Skip tour' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Reloaded (as on another device), the welcome tour stays away, and the Expenses tour takes
    // its turn: on an empty page, only its Budgets step has something to point at.
    const progress = page.waitForRequest((r) => r.url().includes('/rest/v1/user_onboarding'))
    await page.reload()
    const progressRequest = await progress
    await expect(page.getByText('Track your first expense')).toBeVisible()
    const budgets = page.getByRole('dialog', { name: 'Budgets' })
    await expect(budgets).toContainText('4 of 4')
    await expect(page.getByRole('dialog', { name: 'Welcome to Lintel' })).toHaveCount(0)
    await budgets.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The getting-started checklist, ticked from the household's data: nothing yet.
    await expect(page.getByRole('region', { name: 'Get your home set up' })).toContainText(
      '0 of 6 done',
    )

    // The other modules' tours would cover the steps below.
    await markToursSeen(
      page,
      progressRequest,
      MODULE_TOURS.filter((t) => t.id !== 'expenses'),
    )
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
    await guestPage.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await guestPage.getByRole('button', { name: 'Create account' }).click()
    await guestPage.getByRole('button', { name: 'Join household' }).click()
    await expect(guestPage.getByText('Welcome to Obi home')).toBeVisible()
    await guestPage.getByRole('button', { name: 'Skip tour' }).click()
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
    // Realtime can take a while to connect on a cold CI runner.
    await expect(page.getByLabel('Bought Tomatoes')).toBeChecked({ timeout: 30_000 })

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

    // The trip is in Expenses, and what was bought is in the pantry.
    await page.goto('/')
    await expect(page.getByRole('link', { name: /^Shopping/ })).toContainText('₦2,500')
    // An expense, a receipt, a second member and a shopping list: four of the six first things.
    await expect(page.getByRole('region', { name: 'Get your home set up' })).toContainText(
      '4 of 6 done',
    )
    await page.goto('/kitchen/pantry')
    await expect(page.getByRole('group', { name: 'How much Tomatoes' })).toContainText('1 piece')
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

  await test.step('items: give one its units and merge a duplicate into it', async () => {
    // A second name for the same thing, added from the pantry: 1 piece.
    await page.goto('/kitchen/pantry')
    await page.getByLabel('Add to the pantry').fill('Fresh tomatoes')
    await page.getByRole('option', { name: 'Add “Fresh tomatoes”' }).click()
    await expect(page.getByRole('group', { name: 'How much Fresh tomatoes' })).toBeVisible()

    await page.getByRole('link', { name: 'Manage items' }).click()
    await page.getByRole('link', { name: /^Tomatoes/ }).click()
    await expect(page.getByRole('heading', { name: 'Tomatoes' })).toBeVisible()

    // 1 piece = 0.2 kg.
    await page.getByLabel('How many in 1 piece').fill('0.2')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('1 piece = 0.2 kg')).toBeVisible()

    // Merging moves its pantry stock (and anything else) here.
    await page.getByLabel('Item to merge in').click()
    await page.getByRole('option', { name: 'Fresh tomatoes' }).click()
    await page.getByRole('button', { name: 'Merge…' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Merge Fresh tomatoes into Tomatoes?' })
    await dialog.getByRole('button', { name: 'Merge' }).click()
    await expect(page.getByText('Merged Fresh tomatoes into Tomatoes')).toBeVisible()
    await expect(page.getByRole('link', { name: 'In the pantry: 2 pieces' })).toBeVisible()

    await page.goto('/kitchen/pantry')
    await expect(page.getByRole('group', { name: 'How much Tomatoes' })).toContainText('2 pieces')
    await expect(page.getByRole('group', { name: 'How much Fresh tomatoes' })).toHaveCount(0)
  })

  await test.step('recipes: add one with ingredients and scale it from 4 to 10 servings', async () => {
    await page.goto('/kitchen/recipes')
    await page.getByRole('link', { name: 'Add a recipe' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Pepper soup')
    await page.getByRole('button', { name: 'Soup', exact: true }).click()

    const ingredient = page.getByLabel('Add an ingredient')
    await ingredient.fill('Tomatoes')
    await page.getByRole('option', { name: /^Tomatoes/ }).click()
    await ingredient.fill('Uziza seeds')
    await page.getByRole('option', { name: 'Add “Uziza seeds”' }).click()
    await page.getByLabel('Quantity').nth(0).fill('3')
    await page.getByLabel('Quantity').nth(1).fill('2')
    await page.getByLabel('Step 1', { exact: true }).fill('Boil everything together.')
    await page.getByRole('button', { name: 'Add recipe' }).click()

    await expect(page.getByRole('heading', { name: 'Pepper soup' })).toBeVisible()
    await expect(page.getByText('3 pieces', { exact: true })).toBeVisible()
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'More servings' }).click()
    await expect(page.getByRole('group', { name: 'Servings' })).toContainText('10')
    await expect(page.getByText('7.5 pieces', { exact: true })).toBeVisible()
    await expect(page.getByText('5 pieces', { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'Back to recipes' }).click()
    await expect(page.getByRole('link', { name: /^Pepper soup/ })).toContainText('2 ingredients')
  })

  await test.step('can I cook it? what the pantry is short of goes on the list, once', async () => {
    // For 10: 7.5 tomatoes against the 2 in the pantry, and no uziza at all.
    await page.getByRole('link', { name: /^Pepper soup/ }).click()
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'More servings' }).click()
    await expect(page.getByText("You can't cook this yet")).toBeVisible()
    await expect(page.getByText('Short: need 5.5 pieces more')).toBeVisible()
    await page.getByRole('button', { name: 'Add missing to list' }).click()
    await page.getByRole('button', { name: 'Add 2 items to the list' }).click()
    await expect(page.getByText('Added 2 items to the list.')).toBeVisible()

    // Again: it's all on the list already, so there's nothing to add.
    await page.getByRole('button', { name: 'Add missing to list' }).click()
    await expect(page.getByRole('button', { name: 'Choose what to add' })).toBeDisabled()
    await page.keyboard.press('Escape')

    await page.goto('/kitchen/list')
    await expect(page.getByLabel(/^Bought /)).toHaveCount(2)
    await expect(page.getByText(/for Pepper soup$/)).toHaveCount(2)
  })

  await test.step('meal plan: a Sunday pot covers Monday lunch, on desktop and on a phone', async () => {
    await page.goto('/kitchen/plan')
    await page.getByRole('button', { name: /^Add to Dinner on Sunday/ }).click()
    await page.getByRole('button', { name: 'Pepper soup', exact: true }).click()
    await page.getByLabel(/^Mon \d+ · Lunch$/).check()
    await page.getByRole('button', { name: 'Add to the plan' }).click()
    await expect(page.getByText(/^Pepper soup planned for/)).toBeVisible()
    await expect(page.getByText('Pot for 8, 1 more meal')).toBeVisible()
    await expect(page.getByText('Leftovers from Sun')).toBeVisible()

    // On a phone: a day at a time.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('group', { name: 'Day' }).getByRole('button').nth(1).click()
    await expect(page.getByRole('heading', { name: /^Monday/ })).toBeVisible()
    await expect(page.getByText('Leftovers from Sun')).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  await test.step('the week onto the list: next week, less the pantry, merged with the list', async () => {
    // Next week: pepper soup on Sunday for Monday and Tuesday lunch too, a pot for 12.
    // Wait for next week to show: until then the page (and its buttons) is still this week's.
    const thisWeek = (await page.getByRole('heading', { level: 2 }).first().textContent()) ?? ''
    await page.getByRole('link', { name: 'Next week' }).click()
    await expect(page.getByRole('heading', { name: thisWeek, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^Add to Dinner on Sunday/ }).click()
    await page.getByRole('button', { name: 'Pepper soup', exact: true }).click()
    await page.getByLabel(/^Mon \d+ · Lunch$/).check()
    await page.getByLabel(/^Tue \d+ · Lunch$/).check()
    await page.getByRole('button', { name: 'Add to the plan' }).click()
    await expect(page.getByText('Pot for 12, 2 more meals')).toBeVisible()

    // 9 tomatoes, less the 2 in the pantry, and 6 uziza: both partly on the list already.
    await page.getByRole('button', { name: 'Shopping list' }).click()
    const sheet = page.getByRole('dialog', { name: 'Shopping for the week' })
    await expect(sheet.getByText('7 pieces', { exact: true })).toBeVisible()
    await expect(sheet.getByText('6 pieces', { exact: true })).toBeVisible()
    await sheet.getByRole('button', { name: 'Add 2 items to the list' }).click()
    await expect(page.getByText('Topped up 2 items on the list.')).toBeVisible()

    await page.goto('/kitchen/list')
    await expect(page.getByLabel(/^Bought /)).toHaveCount(2)
    await expect(page.getByText(/^7 pieces/)).toBeVisible()
    await expect(page.getByText(/^6 pieces/)).toBeVisible()
  })

  await test.step('cooked it: the pot comes out of the pantry; the plan weighs the week against the budget', async () => {
    await page.goto('/kitchen/recipes')
    await page.getByRole('link', { name: /^Pepper soup/ }).click()
    await page.getByRole('button', { name: 'Cooked it' }).click()
    // For 4: 3 tomatoes, of the 2 in the pantry; no uziza there to take.
    const sheet = page.getByRole('dialog', { name: 'Cooked Pepper soup' })
    await expect(sheet.getByText(/2 pieces → 0 pieces/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Take 1 out of the pantry' }).click()
    await expect(page.getByText('Pepper soup cooked: took 1 item out of the pantry')).toBeVisible()
    await page.goto('/kitchen/pantry')
    await expect(page.getByRole('group', { name: 'How much Tomatoes' })).toContainText('0 pieces')

    await page.goto('/kitchen/plan')
    await expect(page.getByText("This week's food, from the latest prices")).toBeVisible()
    await expect(page.getByText(/^Groceries in /)).toBeVisible()
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
    // Due in about 37 days, past the Upcoming view's 30, so it's under All tasks.
    await page.goto('/tasks?view=all')
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

    await page.getByLabel('Current password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()
  })

  await test.step('sign out and back in with the new password', async () => {
    await page.goto('/more')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible()
  })
})
