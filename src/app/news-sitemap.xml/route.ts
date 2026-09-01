import { getNewsImpactHistoryItemsFromAuthority } from "@/lib/news-impact-history-authority";
import { getNewsImpactDetailPath } from "@/lib/news-impact-history";

export const dynamic = "force-dynamic";

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const now = Date.now();
  const items = (await getNewsImpactHistoryItemsFromAuthority())
    .filter((item) => {
      const published = Date.parse(item.publishedAt);
      return Number.isFinite(published) && published <= now && now - published <= 2 * 24 * 60 * 60 * 1_000;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 1000);
  const urls = items.map((item) => `  <url>\n    <loc>${xmlEscape(`https://tecpey.ir${getNewsImpactDetailPath(item)}`)}</loc>\n    <news:news>\n      <news:publication><news:name>TecPey</news:name><news:language>${item.locale === "fa" ? "fa" : "en"}</news:language></news:publication>\n      <news:publication_date>${xmlEscape(item.publishedAt)}</news:publication_date>\n      <news:title>${xmlEscape(item.title)}</news:title>\n    </news:news>\n  </url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
