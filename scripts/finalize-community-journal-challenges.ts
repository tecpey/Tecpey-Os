import { finalizeEndedOfficialJournalChallenges } from "../src/lib/community-journal-challenge-finalization";

const configuredLimit = Number(process.env.COMMUNITY_CHALLENGE_FINALIZATION_BATCH ?? 100);
const requestedLimit = Number.isFinite(configuredLimit)
  ? Math.max(1, Math.min(250, Math.trunc(configuredLimit)))
  : 100;
const result = await finalizeEndedOfficialJournalChallenges(requestedLimit);

if (!result.available) {
  console.error(JSON.stringify({
    ok: false,
    error: "community_challenge_finalization_unavailable",
    runId: result.runId,
  }));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, ...result }));
if (result.failures.length > 0) process.exitCode = 2;
