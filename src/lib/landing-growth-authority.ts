import type { ContentLocale } from "./content-growth";
import {
  buildLandingGrowthSchemasFromRadar,
  getLandingGrowthRadarFromNewsItems,
  type LandingGrowthRadarModel,
} from "./landing-growth";
import { getNewsImpactHistoryAuthoritySnapshot } from "./news-impact-history-authority";

export async function getLandingGrowthRadarFromAuthority(
  locale: ContentLocale,
): Promise<LandingGrowthRadarModel> {
  const authority = await getNewsImpactHistoryAuthoritySnapshot(locale);
  return getLandingGrowthRadarFromNewsItems(locale, authority.items, {
    sourceAuthority: authority.sourceAuthority,
    authorityUpdatedAt: authority.latestPersistedRecordedAt,
    authorityHighPriorityNewsCount: authority.highPriorityPersistedCount,
  });
}

export async function buildLandingGrowthSchemasFromAuthority(locale: ContentLocale) {
  return buildLandingGrowthSchemasFromRadar(await getLandingGrowthRadarFromAuthority(locale));
}
