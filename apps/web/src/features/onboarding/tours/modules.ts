import type { TourDefinition } from '@home/shared'

// Each shows the first time someone opens the module's page (after the welcome tour). Steps
// whose target isn't there, e.g. on an empty page, are skipped.

export const expensesTour: TourDefinition = {
  id: 'expenses',
  version: 1,
  trigger: 'first-visit',
  route: '/',
  steps: [
    {
      target: 'expenses.summary',
      title: 'This month',
      body: 'What the home has spent this month. The arrows step back through earlier months.',
      side: 'bottom',
    },
    {
      target: 'expenses.filters',
      title: 'Filters',
      body: 'Filter by category, provider, who paid, or receipts.',
      side: 'bottom',
    },
    {
      target: 'expenses.pending',
      title: 'To confirm',
      body: 'Recurring bills wait here for you to confirm.',
      side: 'bottom',
    },
    {
      target: 'expenses.budgets',
      title: 'Budgets',
      body: 'Set a monthly budget per category, under Budgets.',
      side: 'right',
    },
  ],
}

export const kitchenTour: TourDefinition = {
  id: 'kitchen',
  version: 1,
  trigger: 'first-visit',
  route: '/kitchen',
  steps: [
    {
      route: '/kitchen/list',
      target: 'kitchen.quick-add',
      title: 'The shopping list',
      body: 'Type an item and press Enter. Everyone in the house sees it live.',
      side: 'bottom',
    },
    {
      target: 'kitchen.start-shopping',
      title: 'Start shopping',
      body: 'At the market? Start shopping. It works offline.',
      side: 'bottom',
    },
    {
      target: 'kitchen.tab-pantry',
      title: 'Pantry',
      body: 'Track what’s in the fridge and store room. Low items go back on the list.',
      side: 'bottom',
    },
    {
      target: 'kitchen.tab-prices',
      title: 'Prices',
      body: 'See how prices change each time you shop.',
      side: 'bottom',
    },
    {
      target: 'kitchen.tab-gas',
      title: 'Cooking gas',
      body: 'Log gas refills and we’ll predict the next one.',
      side: 'bottom',
    },
  ],
}

export const tasksTour: TourDefinition = {
  id: 'tasks',
  version: 1,
  trigger: 'first-visit',
  route: '/tasks',
  steps: [
    {
      target: 'tasks.add-button',
      title: 'Add a task',
      body: 'Create a one-off or recurring task.',
      side: 'bottom',
    },
    {
      target: 'tasks.upcoming',
      title: 'What’s due',
      body: 'Upcoming and overdue tasks. We’ll email reminders.',
      side: 'bottom',
    },
    {
      title: 'Log what it cost',
      body: 'When you complete a task, you can log what it cost in one tap.',
    },
  ],
}

export const providersTour: TourDefinition = {
  id: 'providers',
  version: 1,
  trigger: 'first-visit',
  route: '/providers',
  steps: [
    {
      target: 'providers.add-button',
      title: 'Add a provider',
      body: 'Save your plumber, electrician, gas vendor…',
      side: 'bottom',
    },
    {
      target: 'providers.list',
      title: 'Your providers',
      body: 'Open a provider to call, WhatsApp, and see how much you’ve spent with them.',
      side: 'top',
    },
  ],
}

export const MODULE_TOURS: readonly TourDefinition[] = [
  expensesTour,
  kitchenTour,
  tasksTour,
  providersTour,
]
