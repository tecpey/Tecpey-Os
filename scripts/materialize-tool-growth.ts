import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import rawTools from "@/data/traderTools.json";
import { toolGrowthCandidates } from "@/data/toolGrowthCandidates";
import {
  materializeToolGrowthSnapshot,
  slugifyToolName,
  type TraderToolRecord,
} from "@/lib/tool-growth-automation";

function isoFromEnv(): string | undefined {
  const raw = process.env.TOOL_GROWTH_GENERATED_AT?.trim();
  if (!raw) return undefined;
  const normalized = new Date(raw).toISOString();
  if (normalized !== raw) throw new Error("tool_growth_generated_at_invalid");
  return normalized;
}

function thresholdFromEnv(): number | undefined {
  const raw = process.env.TOOL_GROWTH_PUBLISH_THRESHOLD?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("tool_growth_publish_threshold_invalid");
  }
  return value;
}

async function main() {
  const existingTools = rawTools as TraderToolRecord[];
  const snapshot = materializeToolGrowthSnapshot(toolGrowthCandidates, {
    generatedAt: isoFromEnv(),
    publishThreshold: thresholdFromEnv(),
    sourceMode: "curated_seed",
    existingSlugs: existingTools.map((tool) => slugifyToolName(tool.name)),
    existingDomains: existingTools.map((tool) => tool.domain),
  });

  const outputPath = path.join(process.cwd(), "src/data/generated/toolGrowthSnapshot.json");
  const tempPath = `${outputPath}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o644 });
  await rename(tempPath, outputPath);

  console.log(JSON.stringify({
    ok: true,
    outputPath,
    evaluated: snapshot.stats.evaluated,
    publishedContent: snapshot.stats.publishedContent,
    rejected: snapshot.stats.rejected,
    externalEnabled: snapshot.stats.externalEnabled,
  }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "tool_growth_materialization_failed";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
