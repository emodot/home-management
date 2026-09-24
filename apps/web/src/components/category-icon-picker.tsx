import { CATEGORY_ICONS, type CategoryIcon as CategoryIconName } from '@home/shared'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CATEGORY_ICON_COMPONENTS, CategoryIcon } from './category-icon'

export function CategoryIconPicker({
  value,
  onChange,
}: {
  value: CategoryIconName
  onChange: (icon: CategoryIconName) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Choose icon">
          <CategoryIcon icon={value} className="size-7 bg-transparent" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="grid w-64 grid-cols-6 gap-1 p-2">
        {CATEGORY_ICONS.map((icon) => {
          const Icon = CATEGORY_ICON_COMPONENTS[icon]
          return (
            <DropdownMenuItem
              key={icon}
              onSelect={() => onChange(icon)}
              className="justify-center p-2 data-[active=true]:bg-accent"
              data-active={icon === value}
              aria-label={icon}
            >
              <Icon aria-hidden />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
