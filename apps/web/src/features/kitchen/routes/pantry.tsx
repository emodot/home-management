import { PackageOpenIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function PantryPage() {
  return (
    <EmptyState icon={PackageOpenIcon} title="Track what's in your kitchen">
      What you buy lands here, by fridge, freezer, pantry and store room, with what to use soon.
    </EmptyState>
  )
}
