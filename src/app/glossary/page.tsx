import type { Metadata } from "next";
import GlossaryClient from "@/components/content/GlossaryClient";
import { getAlternateLocales, getCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: 'واژه\u200cنامه تخصصی رمزارز تک\u200cپی',
  description: 'واژه\u200cنامه کامل رمزارز با تعریف، مثال و ریسک.',
  alternates: {
    canonical: getCanonicalUrl("/glossary"),
    languages: getAlternateLocales("/glossary", "/en/glossary"),
  },
};

export default function Page() {
  return <GlossaryClient locale="fa" />;
}
