"use client";

import { useEffect } from "react";
import { hydrateProgress } from "@/lib/academy-progress";

export default function AcademyStateBootstrap({ locale }: { locale: "fa" | "en" }) {
  useEffect(() => {
    void hydrateProgress(locale);
  }, [locale]);

  return null;
}
