import { ChefHatIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A recipe's photo, or a quiet placeholder while there's none (or it's still signing). */
export function RecipePhoto({ url, className }: { url: string | undefined; className?: string }) {
  return (
    <div className={cn('overflow-hidden bg-muted', className)}>
      {url ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/60">
          <ChefHatIcon className="size-8" aria-hidden />
        </div>
      )}
    </div>
  )
}
