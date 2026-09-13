import { TecpeyGrowthStory } from "@/components/home/TecpeyGrowthStory";
import type { LandingGrowthRadarModel } from "@/lib/landing-growth";

export default function TecpeyEnterpriseLanding({ growthRadarPromise }: { growthRadarPromise: Promise<LandingGrowthRadarModel> }) {
  return <TecpeyGrowthStory locale="fa" growthRadarPromise={growthRadarPromise} />;
}
