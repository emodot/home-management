import type { CategoryIcon as CategoryIconName } from '@home/shared'
import {
  BabyIcon,
  BuildingIcon,
  BusIcon,
  CarIcon,
  CircleEllipsisIcon,
  CircleIcon,
  DropletsIcon,
  FlameIcon,
  FuelIcon,
  GiftIcon,
  GraduationCapIcon,
  HammerIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LightbulbIcon,
  PawPrintIcon,
  PhoneIcon,
  ShieldIcon,
  ShirtIcon,
  ShoppingBasketIcon,
  SofaIcon,
  SparklesIcon,
  TreesIcon,
  TvIcon,
  UtensilsIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const CATEGORY_ICON_COMPONENTS: Record<CategoryIconName, LucideIcon> = {
  lightbulb: LightbulbIcon,
  zap: ZapIcon,
  fuel: FuelIcon,
  droplets: DropletsIcon,
  wifi: WifiIcon,
  wrench: WrenchIcon,
  sparkles: SparklesIcon,
  shield: ShieldIcon,
  building: BuildingIcon,
  'key-round': KeyRoundIcon,
  'shopping-basket': ShoppingBasketIcon,
  sofa: SofaIcon,
  'circle-ellipsis': CircleEllipsisIcon,
  'graduation-cap': GraduationCapIcon,
  car: CarIcon,
  baby: BabyIcon,
  'heart-pulse': HeartPulseIcon,
  utensils: UtensilsIcon,
  shirt: ShirtIcon,
  'paw-print': PawPrintIcon,
  hammer: HammerIcon,
  flame: FlameIcon,
  tv: TvIcon,
  phone: PhoneIcon,
  gift: GiftIcon,
  landmark: LandmarkIcon,
  trees: TreesIcon,
  bus: BusIcon,
  circle: CircleIcon,
}

/** A category's icon in a tinted circle. Unknown icon names fall back to a plain circle. */
export function CategoryIcon({
  icon,
  className,
}: {
  icon: string | undefined
  className?: string
}) {
  const icons: Partial<Record<string, LucideIcon>> = CATEGORY_ICON_COMPONENTS
  const Icon = (icon ? icons[icon] : undefined) ?? CircleIcon
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  )
}
