import { readFile } from "node:fs/promises";

const directRoutes = Object.freeze([
  ["src/app/api/academy/auth/login/route.ts", "req"],
  ["src/app/api/academy/auth/register/route.ts", "req"],
  ["src/app/api/academy-auth/route.ts", "req"],
  ["src/app/api/academy-certificates/route.ts", "req"],
  ["src/app/api/academy-flashcards/route.ts", "req"],
  ["src/app/api/academy-lead/route.ts", "request"],
  ["src/app/api/academy-lesson-assessment/route.ts", "req"],
  ["src/app/api/academy-reflections/route.ts", "req"],
  ["src/app/api/academy-simulator-decision/route.ts", "req"],
  ["src/app/api/academy-specialized-lead/route.ts", "req"],
  ["src/app/api/academy-student-profile/route.ts", "req"],
  ["src/app/api/academy-term-progress/route.ts", "req"],
  ["src/app/api/admin/withdrawals/[id]/route.ts", "req"],
  ["src/app/api/ai-mentor/route.ts", "request"],
  ["src/app/api/api-keys/[id]/route.ts", "req"],
  ["src/app/api/api-keys/route.ts", "req"],
  ["src/app/api/auth/2fa/backup/route.ts", "req"],
  ["src/app/api/auth/2fa/disable/route.ts", "req"],
  ["src/app/api/auth/2fa/enroll/route.ts", "req"],
  ["src/app/api/auth/2fa/verify/route.ts", "req"],
  ["src/app/api/auth/devices/[id]/route.ts", "req"],
  ["src/app/api/auth/password/change/route.ts", "req"],
  ["src/app/api/auth/webauthn/auth/challenge/route.ts", "req"],
  ["src/app/api/auth/webauthn/auth/verify/route.ts", "req"],
  ["src/app/api/auth/webauthn/credentials/[id]/route.ts", "req"],
  ["src/app/api/auth/webauthn/register/verify/route.ts", "req"],
  ["src/app/api/auth/withdraw/authorize/route.ts", "req"],
  ["src/app/api/auth/withdraw/route.ts", "req"],
  ["src/app/api/command-center/auth/bootstrap/challenge/route.ts", "req"],
  ["src/app/api/command-center/auth/bootstrap/verify/route.ts", "req"],
  ["src/app/api/command-center/auth/passkey/verify/route.ts", "req"],
  ["src/app/api/command-center/campaign/route.ts", "req"],
  ["src/app/api/community/profile/route.ts", "req"],
  ["src/app/api/device-token/route.ts", "req"],
  ["src/app/api/learning-events/route.ts", "req"],
  ["src/app/api/mentor-challenge/route.ts", "req"],
  ["src/app/api/mentor-conversations/migrate/route.ts", "req"],
  ["src/app/api/mentor-memory/route.ts", "req"],
  ["src/app/api/notifications/[id]/route.ts", "req"],
  ["src/app/api/notifications/consent/route.ts", "req"],
  ["src/app/api/notifications/preferences/route.ts", "req"],
  ["src/app/api/notifications/read/route.ts", "req"],
  ["src/app/api/offline-sync/route.ts", "req"],
  ["src/app/api/orders/route.ts", "req"],
  ["src/app/api/trading-arena/execution/route.ts", "request"],
  ["src/app/api/trading-arena/reflections/route.ts", "request"],
  ["src/app/api/trading-arena/route.ts", "request"],
]);

const failures = [];
const utilityPath = "src/lib/security/bounded-request-body.ts";
const utility = await readFile(utilityPath, "utf8");
for (const [label, pattern] of [
  ["stream reader", /request\.body\.getReader\(\)/],
  ["actual byte counter", /bytesRead \+= value\.byteLength/],
  ["over-limit cancellation", /cancelReader\(reader, "payload_too_large"\)/],
  ["compressed-body rejection", /unsupported_content_encoding/],
  ["fatal UTF-8 decoder", /TextDecoder\("utf-8", \{ fatal: true \}\)/],
  ["bounded NextRequest reconstruction", /export async function readBoundedJsonRequest/],
]) {
  if (!pattern.test(utility)) failures.push(`${utilityPath}: missing ${label}`);
}

const MAX_GOVERNED_BODY_BYTES = 8 * 1024 * 1024;

// These assertions check the security property — the request body is only ever
// read through the streaming byte authority — rather than one spelling of it.
// Pinning an exact call shape rots silently: a generic type argument, a renamed
// result binding, or consuming `result.value` instead of re-parsing all used to
// fail this gate against correct, fully bounded routes.
for (const [path, requestVariable] of directRoutes) {
  const source = await readFile(path, "utf8");
  if (!source.includes(
    'import { readBoundedJsonRequest } from "@/lib/security/bounded-request-body";',
  )) {
    failures.push(`${path}: bounded body authority import is missing`);
    continue;
  }

  const callPattern = new RegExp(
    `(?:const|let)\\s+(\\w+)\\s*=\\s*await\\s+readBoundedJsonRequest` +
      `(?:\\s*<[\\s\\S]*?>)?\\s*\\(\\s*${requestVariable}\\s*,\\s*\\{[\\s\\S]*?maxBytes:\\s*([0-9_]+)`,
    "g",
  );
  const calls = [...source.matchAll(callPattern)];
  if (calls.length === 0) {
    failures.push(`${path}: explicit bounded body call/maxBytes is missing`);
    continue;
  }

  for (const call of calls) {
    const maxBytes = Number(call[2].replaceAll("_", ""));
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > MAX_GOVERNED_BODY_BYTES
    ) {
      failures.push(`${path}: maxBytes is outside the governed range`);
    }
  }

  // Every bounded read must have its failure returned, whichever name it binds.
  for (const resultName of new Set(calls.map((call) => call[1]))) {
    const returnsFailure =
      new RegExp(`!\\s*${resultName}\\.ok\\b`).test(source) ||
      source.includes(`${resultName}.error`);
    if (!returnsFailure) {
      failures.push(
        `${path}: bounded errors are not returned safely for "${resultName}"`,
      );
    }
  }

  // A route may consume `result.value` directly — that never touches the raw
  // stream. If it does re-parse, it must parse the reconstructed bounded
  // request, and only after the byte authority has run.
  const rawParser = new RegExp(
    `\\b${requestVariable}\\.(?:json|text|formData|arrayBuffer|blob)\\s*\\(`,
  ).exec(source);
  if (rawParser) {
    const rebound = [...new Set(calls.map((call) => call[1]))].some((resultName) =>
      source.includes(`${requestVariable} = ${resultName}.request;`),
    );
    if (!rebound) {
      failures.push(`${path}: existing parser is not rebound to the bounded request`);
    }
    if (calls[0].index > rawParser.index) {
      failures.push(`${path}: body parser runs before the streaming byte authority`);
    }
  }
}

const aliasPath = "src/app/api/ai-mentor-v2/route.ts";
const alias = await readFile(aliasPath, "utf8");
if (!/POST as canonicalPost/.test(alias) || !/return canonicalPost\(req\)/.test(alias)) {
  failures.push(`${aliasPath}: compatibility alias must inherit the bounded canonical handler`);
}

if (directRoutes.length !== 47) {
  failures.push(`guard inventory drift: expected 47 direct routes, found ${directRoutes.length}`);
}

if (failures.length) {
  console.error("Bounded request body authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Bounded request body authority check passed for 47 direct handlers and 1 canonical alias.",
);
