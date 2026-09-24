import {
  ChartColumnIcon,
  ClipboardCheckIcon,
  EllipsisIcon,
  HardHatIcon,
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
}

const isExpensesPath = (pathname: string) => pathname === '/' || pathname.startsWith('/expenses')

export const SIDEBAR_ITEMS: NavItem[] = [
  { to: '/', label: 'Expenses', icon: ReceiptTextIcon, matches: isExpensesPath },
  { to: '/tasks', label: 'Tasks', icon: ClipboardCheckIcon },
  { to: '/providers', label: 'Providers', icon: HardHatIcon },
  { to: '/insights', label: 'Insights', icon: ChartColumnIcon },
  { to: '/recurring', label: 'Recurring bills', icon: RepeatIcon },
  { to: '/budgets', label: 'Budgets', icon: PiggyBankIcon },
  { to: '/categories', label: 'Categories', icon: TagsIcon },
  { to: '/members', label: 'Members', icon: UsersIcon },
  { to: '/recently-deleted', label: 'Recently deleted', icon: Trash2Icon },
]

// Tasks and Providers join this list in their milestones.
export const BOTTOM_ITEMS: NavItem[] = [
  { to: '/', label: 'Expenses', icon: ReceiptTextIcon, matches: isExpensesPath },
  { to: '/tasks', label: 'Tasks', icon: ClipboardCheckIcon },
  { to: '/providers', label: 'Providers', icon: HardHatIcon },
  {
    to: '/more',
    label: 'More',
    icon: EllipsisIcon,
    matches: (p) =>
      [
        '/more',
        '/insights',
        '/recurring',
        '/budgets',
        '/categories',
        '/members',
        '/recently-deleted',
        '/households',
      ].some((prefix) => p.startsWith(prefix)),
  },
]
