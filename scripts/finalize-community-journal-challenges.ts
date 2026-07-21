import { finalizeEndedOfficialJournalChallenges } from "../src/lib/community-journal-challenge-finalization";

const requestedLimit = Number(process.env.COMMUNITY_CHALLENGE_FINALIZATION_BATCH ?? 100);
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
