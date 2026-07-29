"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function TermGateLink({
  href,
  termNumber,
  children,
  className = "",
  lockedClassName = "",
  locale = "fa",
}: {
  href: string;
  termNumber: number;
  children: React.ReactNode;
  className?: string;
  lockedClassName?: string;
  locale?: "fa" | "en";
}) {
  const [unlocked, setUnlocked] = useState(termNumber <= 1);

  useEffect(() => {
    let active = true;
    const checkUnlock = async () => {
      if (termNumber <= 1) {
        setUnlocked(true);
        return;
      }
      try {
        const response = await fetch(`/api/academy-term-progress?locale=${locale}`, { cache: "no-store" });
        if (!active || !response.ok) {
          if (active) setUnlocked(false);
          return;
        }
        const data = await response.json();
        const terms = Array.isArray(data?.terms) ? data.terms : [];
        setUnlocked(terms.some((item: { term_number?: number; status?: string }) => Number(item.term_number) === termNumber - 1 && item.status === "passed"));
      } catch {
        if (active) setUnlocked(false);
      }
    };

    void checkUnlock();
    window.addEventListener("tecpey-academy-progress-updated", checkUnlock);
    window.addEventListener("focus", checkUnlock);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-progress-updated", checkUnlock);
      window.removeEventListener("focus", checkUnlock);
    };
  }, [termNumber, locale]);

  if (!unlocked) {
    return (
      <button
        type="button"
        disabled
        title={locale === "fa" ? `برای ورود، ترم ${termNumber - 1} را به‌صورت رسمی با حدنصاب قبولی کامل کنید.` : `Complete term ${termNumber - 1} officially with a passing score to unlock.`}
        className={`${className} ${lockedClassName} cursor-not-allowed opacity-55`}
      >
        {locale === "fa" ? "قفل است" : "Locked"}
      </button>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
