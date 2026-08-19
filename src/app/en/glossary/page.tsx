import type { Metadata } from "next";
import GlossaryClient from "@/components/content/GlossaryClient";
import { getAlternateLocales, getCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: 'TecPey Crypto Glossary',
  description: 'A practical crypto glossary with definitions and risks.',
  alternates: {
    canonical: getCanonicalUrl("/en/glossary"),
    languages: getAlternateLocales("/glossary", "/en/glossary"),
  },
};

export default function Page() {
  return <GlossaryClient locale="en" />;
}
