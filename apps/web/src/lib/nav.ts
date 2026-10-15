import {
  ChartColumnIcon,
  ClipboardCheckIcon,
  CookingPotIcon,
  EllipsisIcon,
  HandCoinsIcon,
  HardHatIcon,
  HistoryIcon,
  PiggyBankIcon,
  RepeatIcon,
  ReceiptTextIcon,
  TagsIcon,
  Trash2Icon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Extra paths that should highlight this item. */
  matches?: (pathname: string) => boolean
  /** Shown to household admins only. */
  adminOnly?: boolean
}

const isExpensesPath = (pathname: string) => pathname === '/' || pathname.startsWith('/expenses')

export const SIDEBAR_ITEMS: NavItem[] = [
  { to: '/', label: 'Expenses', icon: ReceiptTextIcon, matches: isExpensesPath },
  { to: '/kitchen', label: 'Kitchen', icon: CookingPotIcon },
  { to: '/tasks', label: 'Tasks', icon: ClipboardCheckIcon },
  { to: '/providers', label: 'Providers', icon: HardHatIcon },
  { to: '/income', label: 'Income', icon: HandCoinsIcon, adminOnly: true },
  { to: '/insights', label: 'Insights', icon: ChartColumnIcon },
  { to: '/activity', label: 'Activity', icon: HistoryIcon },
  { to: '/recurring', label: 'Recurring bills', icon: RepeatIcon },
  { to: '/budgets', label: 'Budgets', icon: PiggyBankIcon },
  { to: '/categories', label: 'Categories', icon: TagsIcon },
  { to: '/members', label: 'Members', icon: UsersIcon },
  { to: '/recently-deleted', label: 'Recently deleted', icon: Trash2Icon },
]

export const BOTTOM_ITEMS: NavItem[] = [
  { to: '/', label: 'Expenses', icon: ReceiptTextIcon, matches: isExpensesPath },
  { to: '/kitchen', label: 'Kitchen', icon: CookingPotIcon },
  { to: '/tasks', label: 'Tasks', icon: ClipboardCheckIcon },
  {
    to: '/more',
    label: 'More',
    icon: EllipsisIcon,
    matches: (p) =>
      [
        '/more',
        '/profile',
        '/providers',
        '/income',
        '/insights',
        '/activity',
        '/recurring',
        '/budgets',
        '/categories',
        '/members',
        '/recently-deleted',
        '/households',
      ].some((prefix) => p.startsWith(prefix)),
  },
]

/** The data-tour id product tours point at: nav.expenses, nav.kitchen, nav.more, ... */
export function navTourId(item: NavItem): string {
  return `nav.${item.label.toLowerCase().replace(/\s+/g, '-')}`
}
