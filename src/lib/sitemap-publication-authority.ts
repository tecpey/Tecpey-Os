import type { MetadataRoute } from "next";

export type SitemapPublicationState = "published" | "draft" | "needs_review" | "archived";

export type SitemapPublicationRecord = Readonly<{
  family: string;
  path: string;
  state: SitemapPublicationState;
  canonicalPath: string;
  visibleContent: boolean;
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}>;

export function decideSitemapPublication(record: SitemapPublicationRecord): boolean {
  return (
    record.state === "published" &&
    record.visibleContent &&
    record.path.startsWith("/") &&
    record.canonicalPath === record.path &&
    !record.path.includes("#") &&
    !record.path.includes("?")
  );
}

export function getIndexableSitemapEntries(
  records: readonly SitemapPublicationRecord[],
): MetadataRoute.Sitemap {
  return records.filter(decideSitemapPublication).map((record) => ({
    url: `https://tecpey.ir${record.path}`,
    lastModified: record.lastModified,
    changeFrequency: record.changeFrequency,
    priority: record.priority,
  }));
}
