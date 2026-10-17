import { expect, test } from '@playwright/test'
import { createHouseholdWithAdminInvite, joinThroughInvite, onboardingLoaded } from './helpers'

test('a new member takes the welcome tour by keyboard alone, skips it for good, and replays it from Help', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  // Tours drop their animations for people who ask for less motion.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const inviteUrl = await createHouseholdWithAdminInvite(browser, 'Ade flat')
  await joinThroughInvite(page, inviteUrl, `tour-${Date.now()}@example.com`)

  await test.step('the welcome tour, with the keyboard only', async () => {
    const welcome = page.getByRole('dialog', { name: 'Welcome to Lintel' })
    await expect(welcome).toHaveAccessibleDescription(/^1 of 7/)
    await expect(welcome.getByRole('button', { name: 'Next' })).toBeFocused()
    await expect(page.locator('body')).toHaveClass(/driver-simple/)

    // Enter on the focused Next, then the arrow keys.
    await page.keyboard.press('Enter')
    const expenses = page.getByRole('dialog', { name: 'Expenses' })
    await expect(expenses).toHaveAccessibleDescription(/^2 of 7/)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: 'Add an expense' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(expenses).toBeVisible()

    // Tab goes round the popover's buttons and never escapes to the page behind it.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      await expect(page.locator('.driver-popover :focus')).toHaveCount(1)
    }

    // Esc skips it.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  await test.step('skipped is remembered: after a reload the Expenses tour takes its turn', async () => {
    const loaded = onboardingLoaded(page)
    await page.reload()
    await loaded
    // A new household's Expenses page is empty: only the Budgets step has something to show.
    const budgets = page.getByRole('dialog', { name: 'Budgets' })
    await expect(budgets).toHaveAccessibleDescription(/^4 of 4/)
    await expect(page.getByRole('dialog', { name: 'Welcome to Lintel' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // And after another, neither comes back.
    const reloaded = onboardingLoaded(page)
    await page.reload()
    await reloaded
    await expect(page.getByRole('region', { name: 'Get your home set up' })).toBeVisible()
    // Give a tour that would start every chance to.
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  await test.step('Help replays it, and focus goes back to Help after', async () => {
    const help = page.getByRole('button', { name: 'Help' })
    await help.focus()
    // Enter opens the menu on its first item, "A look around"; Enter again chooses it.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'A look around' })).toBeFocused()
    await page.keyboard.press('Enter')

    const welcome = page.getByRole('dialog', { name: 'Welcome to Lintel' })
    await expect(welcome.getByRole('button', { name: 'Next' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(help).toBeFocused()
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the tour points at the bottom nav, with the popover clear of it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000)
    const inviteUrl = await createHouseholdWithAdminInvite(browser, 'Ade studio')
    await joinThroughInvite(page, inviteUrl, `tour-phone-${Date.now()}@example.com`)

    await page
      .getByRole('dialog', { name: 'Welcome to Lintel' })
      .getByRole('button', { name: 'Next' })
      .tap()
    const step = page.getByRole('dialog', { name: 'Expenses' })
    await expect(step).toBeVisible()

    // The highlighted Expenses link is the bottom nav's, and the popover sits above it.
    const target = page.locator('.driver-active-element')
    await expect(target).toHaveText('Expenses')
    const targetBox = await target.boundingBox()
    const popoverBox = await step.boundingBox()
    expect(targetBox && popoverBox).toBeTruthy()
    if (!targetBox || !popoverBox) return
    expect(targetBox.y).toBeGreaterThan(844 / 2)
    expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(targetBox.y)
    // Full width, inside the page's 16px gutters.
    expect(popoverBox.x).toBeGreaterThanOrEqual(16)
    expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(390 - 16 + 0.5)

    await step.getByRole('button', { name: 'Skip tour' }).tap()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
