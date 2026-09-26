import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

const THEMES = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
] as const

/** Theme choice for the account menu. */
export function ThemeSubmenu() {
  const { theme = 'system', setTheme } = useTheme()
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[0]

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <current.icon aria-hidden />
        Theme
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value}>
              {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Theme choice as a segmented control (the More page on phones). */
export function ThemeSwitcher() {
  const { theme = 'system', setTheme } = useTheme()

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-muted p-1">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={theme === t.value}
          onClick={() => setTheme(t.value)}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
        >
          <t.icon className="size-4 shrink-0 max-[359px]:hidden" aria-hidden />
          {t.label}
        </button>
      ))}
    </div>
  )
}
