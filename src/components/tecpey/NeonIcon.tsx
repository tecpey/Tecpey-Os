import type { LucideIcon } from "lucide-react";

export function NeonIcon({ icon: Icon, size = "md" }: { icon: LucideIcon; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-16 w-16",
  };
  const iconSizes = {
    sm: "h-5 w-5",
    md: "h-7 w-7",
    lg: "h-8 w-8",
  };
  return (
    <span className={`relative inline-flex ${sizes[size]} items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-400/10 text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,.28)] backdrop-blur`}>
      <span className="absolute inset-1 rounded-[14px] bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-transparent" />
      <Icon className={`relative ${iconSizes[size]} stroke-[2.7] drop-shadow-[0_0_10px_rgba(34,211,238,.75)]`} />
    </span>
  );
}
