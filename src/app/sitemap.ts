import { getAllIndexableSitemapEntries } from "@/services/sitemap-publication-authority";

export const revalidate = 3600;

export default async function sitemap() {
  return getAllIndexableSitemapEntries();
}
