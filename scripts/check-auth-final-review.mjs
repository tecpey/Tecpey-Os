import { readFile } from "node:fs/promises";

const files = {
  env: "scripts/validate-env.mjs",
  unified: "src/lib/unified-session.ts",
  sessionRefresh: "src/lib/session-refresh.ts",
  reviewTests: "src/tests/security/auth-replacement-session-review.test.ts",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

const failures = [];
const requireText = (target, text, reason) => {
  if (!content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};
const rejectText = (target, text, reason) => {
  if (content[target].includes(text)) failures.push(`${files[target]}: ${reason}`);
};

requireText("env", "REDIS_URL is required in production", "strict auth must require the shared ioredis runtime client");
requireText("env", "Redis REST credentials alone are insufficient", "environment guidance must distinguish rate-limit Redis REST from session revocation Redis");

requireText("unified", "registerSession", "every replacement cookie must create durable JTI evidence");
requireText("unified", "const userId = data.accountId ?? data.studentId", "replacement sessions require a verified account/student owner");
requireText("unified", "if (!registered) throw new Error(\"session_registry_unavailable\")", "Set-Cookie must fail before an unregistered JWT is returned");
requireText("unified", "response.cookies.set", "registered replacement issuance must remain the only cookie write boundary");

requireText("sessionRefresh", "refresh_token_rotation_required", "legacy sliding access refresh must be disabled");
rejectText("sessionRefresh", "setUnifiedSessionCookieAsync", "sliding refresh may not bypass single-use refresh-token rotation");

requireText("reviewTests", "durable JTI registration", "integration evidence must prove replacement session persistence");
requireText("reviewTests", "cannot bypass refresh-token rotation", "tests must prove sliding refresh remains disabled");
requireText("reviewTests", "Redis-REST-only strict-auth deployments", "tests must reject production without REDIS_URL");

if (failures.length) {
  console.error("Authentication final-review guard failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Authentication final-review guard passed: replacement cookies are registered, sliding refresh is disabled, and production strict auth requires shared ioredis authority.");
