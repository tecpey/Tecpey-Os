import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { NeonIcon } from "./NeonIcon";

export function TextOnlyCard({
  title,
  text,
  href,
  icon,
  meta,
}: {
  title: string;
  text: string;
  href?: string;
  icon: LucideIcon;
  meta?: string;
}) {
  const body = (
    <article className="group h-full rounded-[28px] border border-cyan-300/15 bg-white/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,.20)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40 hover:shadow-[0_24px_70px_rgba(34,211,238,.16)]">
      <div className="flex items-start justify-between gap-4">
        <NeonIcon icon={icon} size="md" />
        {meta ? <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">{meta}</span> : null}
      </div>
      <h3 className="mt-5 text-xl font-black leading-9 text-white">{title}</h3>
      <p className="mt-3 text-sm font-bold leading-8 text-slate-300">{text}</p>
      {href ? (
        <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-300">
          مطالعه
          <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
        </div>
      ) : null}
    </article>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
