import type { ContentLocale } from "./content-growth";
import {
  buildLandingGrowthSchemasFromRadar,
  getLandingGrowthRadarFromNewsItems,
  type LandingGrowthRadarModel,
} from "./landing-growth";
import { getNewsImpactHistoryItemsFromAuthority } from "./news-impact-history-authority";

export async function getLandingGrowthRadarFromAuthority(
  locale: ContentLocale,
): Promise<LandingGrowthRadarModel> {
  const newsItems = await getNewsImpactHistoryItemsFromAuthority(locale);
  return getLandingGrowthRadarFromNewsItems(locale, newsItems);
}

export async function buildLandingGrowthSchemasFromAuthority(locale: ContentLocale) {
  return buildLandingGrowthSchemasFromRadar(await getLandingGrowthRadarFromAuthority(locale));
}
