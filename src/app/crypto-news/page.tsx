import type { Metadata } from "next";
import { StructuredData } from "@/components/seo/StructuredData";
import { TrendRadarWidget } from "@/components/growth/TrendRadarWidget";
import { DailyNewsArchive } from "@/components/news/DailyNewsArchive";
import { buildNewsHubSchemas, getNewsHubMetadata, getNewsHubPageModelFromAuthority } from "@/lib/news-detail-pages";
import { getGrowthTrendRadarFromAuthority } from "@/lib/growth-trend-authority";
import { getNewsArchiveDayFromAuthority, getNewsArchiveDaysFromAuthority, isValidArchiveDay, tehranCalendarDay } from "@/lib/news-growth-authority";

export async function generateMetadata(): Promise<Metadata> {
  return getNewsHubMetadata(await getNewsHubPageModelFromAuthority("fa"));
}

type PageProps = {
  searchParams: Promise<{ date?: string | string[]; tag?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CryptoNewsPage({ searchParams }: PageProps) {
  const today = tehranCalendarDay(new Date());
  const requested = await searchParams;
  const dateParam = firstParam(requested.date)?.trim();
  const selectedDay = dateParam && isValidArchiveDay(dateParam) && dateParam <= today ? dateParam : today;
  const requestedTags = (Array.isArray(requested.tag) ? requested.tag : requested.tag ? [requested.tag] : [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
  const [newsHub, trendRadar, items, historicalDays] = await Promise.all([
    getNewsHubPageModelFromAuthority("fa"),
    getGrowthTrendRadarFromAuthority("fa"),
    getNewsArchiveDayFromAuthority(selectedDay, "fa"),
    getNewsArchiveDaysFromAuthority(180),
  ]);
  const availableDays = Array.from(new Set([today, selectedDay, ...historicalDays]))
    .filter((day) => isValidArchiveDay(day) && day <= today)
    .sort((left, right) => right.localeCompare(left));
  return (
    <main className="min-h-screen bg-transparent pt-24">
      <StructuredData data={buildNewsHubSchemas(newsHub)} />
      <TrendRadarWidget data={trendRadar} locale="fa" />
      <DailyNewsArchive initial={{ day: selectedDay, today, items, availableDays }} locale="fa" initialTags={requestedTags} />
    </main>
  );
}
