export const LEGACY_SOCIAL_ARENA_MODULES = new Set([
  "@/lib/trading-arena",
  "@/lib/trading-journal",
  "@/lib/community-leaderboard",
  "@/lib/community-profile",
]);

export function importedModules(source) {
  const modules = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) modules.push(match[1]);
  return modules;
}

export function legacyImportViolations(path, source) {
  return importedModules(source)
    .filter((moduleName) => LEGACY_SOCIAL_ARENA_MODULES.has(moduleName))
    .map((moduleName) => `${path}: protected authority imports ${moduleName}`);
}

export function previewChallengeViolations(source) {
  const forbidden = [
    "loadArenaState",
    "computeArenaStats",
    "getJournalCompletionRate",
    "loadParticipation",
    "joinChallenge",
    "markChallengeComplete",
    "completedAt",
    "entry.score",
  ];
  return forbidden
    .filter((token) => source.includes(token))
    .map((token) => `ChallengeCenter reintroduced browser completion authority: ${token}`);
}
