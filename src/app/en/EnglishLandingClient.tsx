import type { ReactNode } from "react";
import { TecpeyGrowthStory } from "@/components/home/TecpeyGrowthStory";
import type { LandingGrowthRadarModel } from "@/lib/landing-growth";

export default function EnglishLandingClient({ schema, growthRadarPromise }: { schema: ReactNode; growthRadarPromise: Promise<LandingGrowthRadarModel> }) {
  return <TecpeyGrowthStory locale="en" schema={schema} growthRadarPromise={growthRadarPromise} />;
}
