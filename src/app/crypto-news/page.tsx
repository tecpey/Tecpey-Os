import type { Metadata } from "next";
import { CanonicalNewsImpactHub } from "@/components/content/CanonicalNewsImpactHub";
import { CryptoNewsCenter } from "@/components/home/TecpeyHomeAI";
import { StructuredData } from "@/components/seo/StructuredData";
import { buildNewsHubSchemas, getNewsHubMetadata, getNewsHubPageModelFromAuthority } from "@/lib/news-detail-pages";

export async function generateMetadata(): Promise<Metadata> {
  return getNewsHubMetadata(await getNewsHubPageModelFromAuthority("fa"));
}

export default async function CryptoNewsPage() {
  const newsHub = await getNewsHubPageModelFromAuthority("fa");
  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] pt-28">
      <StructuredData data={buildNewsHubSchemas(newsHub)} />
      <CanonicalNewsImpactHub model={newsHub} />
      <CryptoNewsCenter locale="fa" />
    </main>
  );
}
