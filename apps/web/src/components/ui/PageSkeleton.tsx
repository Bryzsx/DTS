import { Skeleton } from "./Skeleton"

export function PageSkeleton() {
  return (
    <div className="animate-entrance">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="space-y-2">
          <Skeleton shimmer className="h-8 w-48" />
          <Skeleton shimmer className="h-4 w-64" />
        </div>
        <Skeleton shimmer className="h-10 w-36 hidden sm:block" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shimmer className="h-28 w-full" />
        ))}
      </div>
      <Skeleton shimmer className="h-72 w-full" />
    </div>
  )
}
