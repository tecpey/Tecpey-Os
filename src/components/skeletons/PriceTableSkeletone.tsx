
interface PriceTableSkeletonProps {
  rows?: number;
  hasIRT?: boolean;
}

export default function PriceTableSkeleton({ rows = 6, hasIRT = false }: PriceTableSkeletonProps) {
  return (
    <div className="max-w-7xl mx-auto px-6">
      {/* Title */}
      <div className="h-8 w-48 bg-gray-100 rounded-lg mx-auto mb-10 animate-pulse" />

      <div className="border border-gray-100  rounded-2xl p-4 md:p-6">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Header */}
            <div
              className={`grid ${
                hasIRT ? "grid-cols-7" : "grid-cols-6"
              } gap-4 py-3 px-6 border-b border-gray-100 `}
            >
              {Array.from({ length: hasIRT ? 7 : 6 }).map((_, i) => (
                <div key={i} className="h-3 w-full bg-gray-100  rounded animate-pulse" />
              ))}
            </div>

            {/* Rows */}
            <div className="px-6">
              {Array.from({ length: rows }).map((_, index) => (
                <div
                  key={index}
                  className={`grid ${
                    hasIRT ? "grid-cols-7" : "grid-cols-6"
                  } gap-4 py-4 px-2 items-center border-b border-gray-50  last:border-0`}
                >
                  {/* Coin */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100  rounded-full animate-pulse" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-14 bg-gray-100  rounded animate-pulse" />
                      <div className="h-2 w-10 bg-gray-50  rounded animate-pulse" />
                    </div>
                  </div>

                  {/* Price */}
                  <div className="h-4 w-20 bg-gray-100  rounded animate-pulse" />

                  {/* IRT Price */}
                  {hasIRT && (
                    <div className="h-4 w-24 bg-gray-100  rounded animate-pulse" />
                  )}

                  {/* Volume */}
                  <div className="h-4 w-16 bg-gray-100  rounded animate-pulse" />

                  {/* Change */}
                  <div className="h-4 w-14 bg-gray-100  rounded animate-pulse" />

                  {/* Chart */}
                  <div className="h-8 w-20 bg-gray-100  rounded animate-pulse" />

                  {/* Button */}
                  <div className="h-8 w-[100px] bg-gray-100  rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* View More */}
        <div className="text-center mt-6 pt-4 border-t border-gray-100 ">
          <div className="h-4 w-24 bg-gray-100  rounded animate-pulse mx-auto" />
        </div>
      </div>
    </div>
  );
}