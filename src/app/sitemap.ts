import { getAllIndexableSitemapEntries } from "@/lib/sitemap-publication-authority";

export default async function sitemap() {
  return getAllIndexableSitemapEntries();
}
