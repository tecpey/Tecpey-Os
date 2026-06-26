interface PriceTableSkeletonProps {
  rows?: number;
  hasIRT?: boolean;
}

export default function PriceTableSkeleton({ rows = 6, hasIRT = false }: PriceTableSkeletonProps) {
  const cols = hasIRT ? 7 : 6;
  return (
    <div className="mx-auto max-w-7xl px-6">
      <div className="skeleton mx-auto mb-10 h-8 w-48 rounded-lg" />

      <div className="rounded-2xl border border-slate-100 p-4 dark:border-white/[0.08] md:p-6">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={`grid grid-cols-${cols} gap-4 border-b border-slate-100 px-6 py-3 dark:border-white/[0.08]`}>
              {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="skeleton h-3 w-full rounded" />
              ))}
            </div>

            <div className="px-6">
              {Array.from({ length: rows }).map((_, index) => (
                <div key={index} className={`grid grid-cols-${cols} items-center gap-4 border-b border-slate-50 px-2 py-4 last:border-0 dark:border-white/[0.04]`}>
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="space-y-1.5">
                      <div className="skeleton h-3 w-14 rounded" />
                      <div className="skeleton h-2 w-10 rounded" />
                    </div>
                  </div>
                  <div className="skeleton h-4 w-20 rounded" />
                  {hasIRT && <div className="skeleton h-4 w-24 rounded" />}
                  <div className="skeleton h-4 w-16 rounded" />
                  <div className="skeleton h-4 w-14 rounded" />
                  <div className="skeleton h-8 w-20 rounded" />
                  <div className="skeleton h-8 w-[100px] rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center dark:border-white/[0.08]">
          <div className="skeleton mx-auto h-4 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}
