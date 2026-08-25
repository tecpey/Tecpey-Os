import { Sparkles } from "lucide-react";
import { TecpeyMark } from "./TecpeyMark";

export function TecpeyMentorMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`relative grid place-items-center rounded-full border border-cyan-200/35 bg-cyan-300/10 ${className}`} aria-hidden="true">
      <TecpeyMark alt="" width={24} height={24} className="h-[72%] w-[72%] object-contain" />
      <Sparkles className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-slate-950 text-cyan-200" />
    </span>
  );
}
