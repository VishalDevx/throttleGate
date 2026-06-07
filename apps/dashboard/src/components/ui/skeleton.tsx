/**
 * Skeleton component for loading placeholders.
 * Provides animated placeholder shapes while content loads.
 *
 * @example
 * <Skeleton className="h-4 w-[250px]" />
 */
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-primary/10', className)}
      {...props}
    />
  )
}

export { Skeleton }
