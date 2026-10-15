import type { TourDefinition } from '@home/shared'

/** A look around, the first time someone opens the app (new members and existing ones alike). */
export const welcomeTour: TourDefinition = {
  id: 'welcome',
  version: 1,
  trigger: 'after-onboarding',
  route: '/',
  steps: [
    { title: 'Welcome to Lintel', body: 'Here’s a 30-second look around.' },
    {
      target: 'nav.expenses',
      title: 'Expenses',
      body: 'Track every naira the home spends. This is your home screen.',
      side: 'right',
    },
    {
      target: 'expenses.add-button',
      title: 'Add an expense',
      body: 'Add an expense from anywhere. Snap the receipt while you’re at it.',
      side: 'bottom',
    },
    {
      target: 'nav.kitchen',
      title: 'Kitchen',
      body: 'Shopping lists, pantry, food prices and cooking gas.',
      side: 'right',
    },
    {
      target: 'nav.tasks',
      title: 'Tasks',
      body: 'Recurring jobs like generator servicing, with email reminders.',
      side: 'right',
    },
    // Household admins only: members can't invite, so the step is skipped for them.
    {
      target: 'household.invite',
      title: 'Invite your household',
      body: 'Invite the people you live with from Members, in this menu. Everyone sees and edits the same home.',
      side: 'bottom',
    },
  ],
}
