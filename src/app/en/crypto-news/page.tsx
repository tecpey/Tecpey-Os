import type { Metadata } from "next";
import { CanonicalNewsImpactHub } from "@/components/content/CanonicalNewsImpactHub";
import { CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";
import { StructuredData } from "@/components/seo/StructuredData";
import { buildNewsHubSchemas, getNewsHubMetadata, getNewsHubPageModelFromAuthority } from "@/lib/news-detail-pages";
import { EnglishShell } from "../components/EnglishUI";

export async function generateMetadata(): Promise<Metadata> {
  return getNewsHubMetadata(await getNewsHubPageModelFromAuthority("en"));
}

export default async function EnglishCryptoNewsPage() {
  const newsHub = await getNewsHubPageModelFromAuthority("en");
  return (
    <EnglishShell>
      <main className="min-h-screen bg-[color:var(--tp-bg)] pt-28">
        <StructuredData data={buildNewsHubSchemas(newsHub)} />
        <CanonicalNewsImpactHub model={newsHub} />
        <CryptoNewsCenter locale="en" />
      </main>
    </EnglishShell>
  );
}
