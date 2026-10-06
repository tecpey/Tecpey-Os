import { getAllIndexableSitemapEntries } from "@/services/sitemap-publication-authority";

export default async function sitemap() {
  return getAllIndexableSitemapEntries();
}
