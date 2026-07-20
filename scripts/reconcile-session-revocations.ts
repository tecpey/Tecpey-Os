import { publishPendingSessionRevocations } from "../src/lib/security/session-authority";

try {
  const published = await publishPendingSessionRevocations();
  console.log(
    JSON.stringify({
      authority: "session_revocation_outbox",
      published,
    }),
  );
  if (!published) process.exitCode = 2;
} catch (error) {
  console.error(
    `[session-revocation-repair] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
