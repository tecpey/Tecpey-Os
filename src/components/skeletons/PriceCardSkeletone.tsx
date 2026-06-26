
export default function PriceCardSkeleton() {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
      {/* Header - Coin name */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-600/50 rounded-full animate-pulse" />
          <div className="h-4 w-16 bg-gray-600/50 rounded animate-pulse" />
        </div>
        <div className="h-6 w-14 bg-gray-600/50 rounded-full animate-pulse" />
      </div>

      {/* Price */}
      <div className="mb-2">
        <div className="h-7 w-24 bg-gray-600/50 rounded animate-pulse" />
      </div>

      {/* Change percentage */}
      <div className="h-4 w-12 bg-gray-600/50 rounded animate-pulse" />
    </div>
  );
}