import { FlameIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function GasPage() {
  return (
    <EmptyState icon={FlameIcon} title="Log your last refill to start tracking">
      After two refills, you'll see how long a cylinder lasts and when the next refill is due.
    </EmptyState>
  )
}
