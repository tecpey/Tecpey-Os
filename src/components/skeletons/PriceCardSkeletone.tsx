export default function PriceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="skeleton h-4 w-16 rounded-lg" />
        </div>
        <div className="skeleton h-6 w-14 rounded-full" />
      </div>
      <div className="mb-2">
        <div className="skeleton h-7 w-24 rounded-lg" />
      </div>
      <div className="skeleton h-4 w-12 rounded-lg" />
    </div>
  );
}
