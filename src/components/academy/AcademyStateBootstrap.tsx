"use client";

import { useEffect } from "react";
import { hydrateProgress } from "@/lib/academy-progress";
import { hydrateDeck } from "@/lib/spaced-repetition";

export default function AcademyStateBootstrap({ locale }: { locale: "fa" | "en" }) {
  useEffect(() => {
    void Promise.all([
      hydrateProgress(locale),
      hydrateDeck(locale),
    ]);
  }, [locale]);

  return null;
}
