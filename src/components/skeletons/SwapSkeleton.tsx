export default function SwapSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-2 bg-[#1e293b] px-4 py-2 rounded-full animate-pulse">
        <div className="w-5 h-5 rounded-full bg-white/20" />

        <div className="flex flex-col gap-1">
          <div className="h-3 w-14 rounded bg-white/20" />
          <div className="h-2 w-10 rounded bg-white/10" />
        </div>

        <div className="w-3 h-3 rounded bg-white/20 ml-2" />
      </div>
    </div>
  );
}
