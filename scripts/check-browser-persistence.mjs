import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const PERSISTENCE_PATTERN = /(?:localStorage|sessionStorage|indexedDB|IndexedDB|caches\.(?:open|match|put|delete)|CacheStorage)/;

// Exact line-count baseline from the repository-wide audit on 2026-07-18.
// Academy specialized lead browser persistence was removed on 2026-07-19.
// Academy article progress/XP browser authority was removed on 2026-07-19.
// Every remediation PR MUST lower the relevant number here in the same change.
// Increasing a count or adding a new file fails CI.
const expectedMatches = new Map(Object.entries({
  "src/app/api/ai-mentor-v2/route.ts": 1,
  "src/app/api/mentor-conversations/migrate/route.ts": 4,
  "src/components/academy/AcademyEngagementHub.tsx": 2,
  "src/components/academy/AcademyMentorCoachCenter.tsx": 5,
  "src/components/academy/AcademySimulationWorld.tsx": 2,
  "src/components/academy/AiMentorExperience.tsx": 6,
  "src/components/academy/GlobalAiMentorWidget.tsx": 8,
  "src/components/offline/OfflineSyncManager.tsx": 1,
  "src/lib/community-challenges.ts": 2,
  "src/lib/community-profile.ts": 2,
  "src/lib/smart-review.ts": 1,
  "src/lib/trading-arena.ts": 3,
  "src/lib/trading-journal.ts": 2,
}));

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
for (const absolute of await walk(ROOT)) {
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  const content = await fs.readFile(absolute, "utf8");
  const count = content.split(/\r?\n/).filter((line) => PERSISTENCE_PATTERN.test(line)).length;
  if (count > 0) actualMatches.set(relative, count);
}

const errors = [];
const files = new Set([...expectedMatches.keys(), ...actualMatches.keys()]);
for (const file of [...files].sort()) {
  const expected = expectedMatches.get(file) ?? 0;
  const actual = actualMatches.get(file) ?? 0;
  if (actual !== expected) {
    errors.push(`${file}: expected ${expected} matching line(s), found ${actual}`);
  }
}

if (errors.length > 0) {
  console.error("Browser persistence baseline changed.\n");
  console.error(errors.join("\n"));
  console.error("\nRemoval is encouraged, but update this baseline in the same reviewed PR. New or increased usage is prohibited.");
  process.exit(1);
}

const total = [...actualMatches.values()].reduce((sum, count) => sum + count, 0);
console.log(`Browser persistence guard passed: ${total} audited matching line(s) remain across ${actualMatches.size} source files.`);
