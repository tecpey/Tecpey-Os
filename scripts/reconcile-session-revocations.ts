import { repairPendingSessionRevocations } from "../src/lib/security/session-authority";

const requestedLimit = Number.parseInt(process.argv[2] ?? "200", 10);
const limit = Number.isFinite(requestedLimit)
  ? Math.max(1, Math.min(requestedLimit, 1_000))
  : 200;

try {
  const result = await repairPendingSessionRevocations(limit);
  console.log(
    JSON.stringify({
      authority: "session_revocation_outbox",
      selected: result.selected,
      published: result.published,
      remainingFromBatch: result.selected - result.published,
    }),
  );
  if (result.selected > result.published) process.exitCode = 2;
} catch (error) {
  console.error(
    `[session-revocation-repair] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
