import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

// Durable browser-authority vectors. Beyond the Storage/Cache APIs, a value
// assigned to document.cookie or window.name also survives navigation and can be
// used to hold state the browser then treats as authoritative — so those writes
// are covered too. Only writes count: reading a server-set cookie
// (`const x = document.cookie`) is legitimate, so the cookie/window.name arms
// match an assignment (`= …`) and not an equality test (`== …`), via the
// negative lookahead.
const PERSISTENCE_PATTERN =
  /(?:localStorage|sessionStorage|indexedDB|IndexedDB|caches\.(?:open|match|put|delete)|CacheStorage|document\.cookie\s*=(?!=)|window\.name\s*=(?!=))/;

// The only classifications a persisting production file may carry. Each names a
// use in which the browser copy is NOT the source of truth: a one-shot import of
// legacy browser state INTO the server, a disposable cache/UI hint rebuilt from
// the server, or an offline projection the server can repair. A classification
// outside this set — anything implying the browser owns authority — is refused,
// which is the launch No-Go rule ("no launch-critical state depends on
// browser-only authority") enforced at the guard rather than left to prose.
const DISPOSABLE_CLASSIFICATIONS = new Set([
  "one-shot-legacy-migration",
  "disposable-ui-cache",
  "repairable-offline-projection",
]);

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
  }),
);

// The quarantined browser-authority modules (`src/lib/trading-arena.ts`,
// `src/lib/trading-journal.ts`) and their only consumers (`ScenarioPlayer`,
// `TradingArenaDashboard`) were deleted once proven unreachable: the live Arena
// route mounts TradingArenaExecutionClient and the scenarios route is a
// migration notice. No browser-owned account, trade or journal authority
// remains. Re-adding one must be a deliberate, reviewed act — not a quiet
// import — so the classification itself is now refused.
const RETIRED_CLASSIFICATIONS = new Set(["quarantined-legacy-authority"]);

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

/**
 * Evaluate the browser-persistence authority policy against a source tree.
 * Pure and side-effect free so it can be exercised by a companion test with
 * fixture trees; the executable guard below is a thin wrapper around it.
 *
 * @returns {Promise<{errors: string[], total: number, classifiedFiles: number, quarantined: number}>}
 */
export async function evaluateBrowserPersistence({
  root,
  cwd = process.cwd(),
  policy = persistencePolicy,
  serverSurfaces = serverAuthoritativeSurfaces,
} = {}) {
  const sourceRoot = root ?? path.resolve(cwd, "src");
  const actualMatches = new Map();
  const discoveredFiles = new Set();
  for (const absolute of await walk(sourceRoot)) {
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    if (relative.startsWith("src/tests/")) continue;
    discoveredFiles.add(relative);
    const content = await fs.readFile(absolute, "utf8");
    const count = content.split(/\r?\n/).filter((line) => PERSISTENCE_PATTERN.test(line)).length;
    if (count > 0) actualMatches.set(relative, count);
  }

  const errors = [];
  for (const file of serverSurfaces) {
    if (!discoveredFiles.has(file)) {
      errors.push(`${file}: protected server-authoritative surface is missing`);
    } else if ((actualMatches.get(file) ?? 0) > 0) {
      errors.push(`${file}: browser persistence is forbidden on the Community journal/challenge authority surface`);
    }
  }

  const allowed = [...DISPOSABLE_CLASSIFICATIONS].join(", ");
  const files = new Set([...policy.keys(), ...actualMatches.keys()]);
  for (const file of [...files].sort()) {
    const entry = policy.get(file);
    const actual = actualMatches.get(file) ?? 0;
    if (!entry) {
      errors.push(`${file}: ${actual} unclassified browser-persistence line(s)`);
      continue;
    }
    // The classification must name a use in which the browser copy is not
    // authoritative. A retired tag, or any tag outside the disposable set
    // (empty, or one that implies browser-owned authority), is refused — so a
    // file cannot persist state by declaring itself authoritative.
    const classification = entry.classification ?? "";
    if (RETIRED_CLASSIFICATIONS.has(classification)) {
      errors.push(`${file}: "${classification}" is retired; browser-owned authority may not be reintroduced`);
    } else if (!DISPOSABLE_CLASSIFICATIONS.has(classification) && !classification.startsWith("quarantined")) {
      errors.push(
        `${file}: "${classification}" is not a recognized disposable classification; ` +
          `browser-owned authority may not be declared (allowed: ${allowed}, or a reviewed quarantined-* legacy tag)`,
      );
    }
    if (actual !== entry.expected) {
      errors.push(`${file}: ${classification}; expected ${entry.expected} matching line(s), found ${actual}`);
    }
  }

  const total = [...actualMatches.values()].reduce((sum, count) => sum + count, 0);
  const quarantined = [...policy.values()].filter((e) =>
    (e.classification ?? "").startsWith("quarantined"),
  ).length;
  return { errors, total, classifiedFiles: actualMatches.size, quarantined };
}

async function main() {
  const { errors, total, classifiedFiles, quarantined } = await evaluateBrowserPersistence();
  if (errors.length > 0) {
    console.error("Browser persistence authority policy changed.\n");
    console.error(errors.join("\n"));
    console.error("\nRemoval is encouraged. New persistence or promotion of quarantined state requires a separate reviewed server-authority migration.");
    process.exit(1);
  }
  console.log(
    `Browser persistence guard passed: ${total} classified matching line(s) remain across ${classifiedFiles} production files; ${quarantined} quarantined legacy modules cannot become official evidence; Community journal, current challenge and finalized history surfaces are persistence-free.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
