"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

export function PublicCredentialShareButton({ title }: { title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function share() {
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url: window.location.href });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(window.location.href);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-white/90 px-5 py-3 text-sm font-black text-slate-950 transition-colors duration-200 hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
      >
        {status === "copied" ? <Check className="h-4 w-4" aria-hidden="true" /> : status === "error" ? <Copy className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
        {status === "copied" ? "لینک کپی شد" : "اشتراک‌گذاری استعلام"}
      </button>
      <p className="mt-2 min-h-5 text-xs font-bold text-[color:var(--tp-muted)]" aria-live="polite">
        {status === "error" ? "کپی لینک ممکن نشد؛ آدرس صفحه را از مرورگر کپی کنید." : ""}
      </p>
    </div>
  );
}
