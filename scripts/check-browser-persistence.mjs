import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const PERSISTENCE_PATTERN = /(?:localStorage|sessionStorage|indexedDB|IndexedDB|caches\.(?:open|match|put|delete)|CacheStorage)/;

const persistencePolicy = new Map(
  Object.entries({
    "src/app/api/ai-mentor-v2/route.ts": {
      expected: 1,
      classification: "one-shot-legacy-migration",
    },
    "src/components/academy/AcademyEngagementHub.tsx": {
      expected: 2,
      classification: "disposable-ui-cache",
    },
    "src/components/academy/AcademyMentorCoachCenter.tsx": {
      expected: 5,
      classification: "disposable-ui-cache",
    },
    "src/components/academy/AcademySimulationWorld.tsx": {
      expected: 2,
      classification: "disposable-ui-cache",
    },
    "src/components/academy/AiMentorExperience.tsx": {
      expected: 6,
      classification: "disposable-ui-cache",
    },
    "src/components/academy/GlobalAiMentorWidget.tsx": {
      expected: 8,
      classification: "disposable-ui-cache",
    },
    "src/components/offline/OfflineSyncManager.tsx": {
      expected: 1,
      classification: "repairable-offline-projection",
    },
    "src/lib/trading-arena.ts": {
      expected: 3,
      classification: "quarantined-legacy-authority",
    },
    "src/lib/trading-journal.ts": {
      expected: 2,
      classification: "quarantined-legacy-authority",
    },
  }),
);

const serverAuthoritativeSurfaces = new Set([
  "src/app/api/community/profile/route.ts",
  "src/components/academy/community/PeerJournals.tsx",
  "src/lib/community-journal-client.ts",
  "src/components/academy/community/ChallengeCenter.tsx",
  "src/lib/community-challenges.ts",
  "src/lib/community-journal-challenge-client.ts",
  "src/lib/community-journal-challenge-authority.ts",
  "src/lib/community-journal-challenge-finalization.ts",
  "src/lib/community-journal-challenge-history-client.ts",
  "src/components/academy/community/FinalizedChallengeHistoryCard.tsx",
]);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const actualMatches = new Map();
const discoveredFiles = new Set();
for (const absolute of await walk(ROOT)) {
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  if (relative.startsWith("src/tests/")) continue;
  discoveredFiles.add(relative);
  const content = await fs.readFile(absolute, "utf8");
  const count = content.split(/\r?\n/).filter((line) => PERSISTENCE_PATTERN.test(line)).length;
  if (count > 0) actualMatches.set(relative, count);
}

const errors = [];
for (const file of serverAuthoritativeSurfaces) {
  if (!discoveredFiles.has(file)) {
    errors.push(`${file}: protected server-authoritative surface is missing`);
  } else if ((actualMatches.get(file) ?? 0) > 0) {
    errors.push(`${file}: browser persistence is forbidden on the Community journal/challenge authority surface`);
  }
}

const files = new Set([...persistencePolicy.keys(), ...actualMatches.keys()]);
for (const file of [...files].sort()) {
  const policy = persistencePolicy.get(file);
  const actual = actualMatches.get(file) ?? 0;
  if (!policy) {
    errors.push(`${file}: ${actual} unclassified browser-persistence line(s)`);
    continue;
  }
  if (!policy.classification) errors.push(`${file}: missing authority classification`);
  if (actual !== policy.expected) {
    errors.push(`${file}: ${policy.classification}; expected ${policy.expected} matching line(s), found ${actual}`);
  }
}

if (errors.length > 0) {
  console.error("Browser persistence authority policy changed.\n");
  console.error(errors.join("\n"));
  console.error("\nRemoval is encouraged. New persistence or promotion of quarantined state requires a separate reviewed server-authority migration.");
  process.exit(1);
}

const total = [...actualMatches.values()].reduce((sum, count) => sum + count, 0);
const quarantined = [...persistencePolicy.values()].filter((entry) =>
  entry.classification.startsWith("quarantined"),
).length;
console.log(
  `Browser persistence guard passed: ${total} classified matching line(s) remain across ${actualMatches.size} production files; ${quarantined} quarantined legacy modules cannot become official evidence; Community journal, current challenge and finalized history surfaces are persistence-free.`,
);
