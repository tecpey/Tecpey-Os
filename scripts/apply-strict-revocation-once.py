from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def strictify_canonical_session(path: str) -> None:
    source = read(path)
    updated = re.sub(
        r"getCanonicalSession\(\s*(req|request)\s*\)",
        r"getCanonicalSession(\1, { strictRevocation: true })",
        source,
    )
    if "strictRevocation: true" not in updated:
        raise SystemExit(f"strict canonical session evidence missing after update: {path}")
    write(path, updated)


for target in [
    "src/app/api/ai-mentor/route.ts",
    "src/app/api/auth/2fa/backup/route.ts",
    "src/app/api/auth/2fa/disable/route.ts",
    "src/app/api/auth/2fa/enroll/route.ts",
    "src/app/api/auth/devices/[id]/route.ts",
    "src/app/api/auth/webauthn/credentials/[id]/route.ts",
    "src/app/api/auth/webauthn/register/verify/route.ts",
    "src/app/api/mentor-memory/route.ts",
]:
    strictify_canonical_session(target)

write(
    "src/lib/notifications/principal.ts",
    '''import { getCanonicalSession } from "../auth-session";

export type NotificationIdentity = {
  studentId: string;
  userId: string | null;
  email: string | null;
};

export async function getNotificationIdentityFromRequest(
  request: Request,
  options: { strictRevocation?: boolean } = {},
): Promise<NotificationIdentity | null> {
  const session = await getCanonicalSession(request, {
    strictRevocation: options.strictRevocation === true,
  });
  if (!session.studentId) return null;
  return {
    studentId: session.studentId,
    userId: session.userId,
    email: session.email,
  };
}
''',
)


def strictify_notification_handler(path: str, method: str) -> None:
    source = read(path)
    start_match = re.search(rf"export async function {method}\b", source)
    if not start_match:
        raise SystemExit(f"{method} handler not found: {path}")
    next_match = re.search(r"\nexport async function [A-Z]+\b", source[start_match.end():])
    end = start_match.end() + next_match.start() if next_match else len(source)
    handler = source[start_match.start():end]
    updated_handler, count = re.subn(
        r"getNotificationIdentityFromRequest\(req\)",
        "getNotificationIdentityFromRequest(req, {\n    strictRevocation: true,\n  })",
        handler,
        count=1,
    )
    if count == 0 and "strictRevocation: true" not in handler:
        raise SystemExit(f"notification strict identity call not found: {path}")
    write(path, source[:start_match.start()] + updated_handler + source[end:])


strictify_notification_handler("src/app/api/notifications/consent/route.ts", "POST")
strictify_notification_handler("src/app/api/notifications/preferences/route.ts", "PATCH")

career_path = "src/lib/community-career.ts"
career = read(career_path)
if "export async function setPublicVisibilityForStudent" not in career:
    marker = "export async function getCurrentPublicProfile(): Promise<CommunityPublicProfile | null> {"
    if marker not in career:
        raise SystemExit("community setter insertion marker missing")
    addition = '''export async function setPublicVisibilityForStudent(
  studentId: string,
  visibility: CommunityPublicVisibility,
): Promise<"updated" | "not_found" | "unavailable"> {
  const result = await withDb(async (client) => {
    const updated = await client.query(
      `UPDATE academy_student_profiles
          SET public_visibility = $2, updated_at = NOW()
        WHERE student_id = $1::uuid
        RETURNING student_id`,
      [studentId, visibility],
    );
    return (updated.rowCount ?? 0) === 1;
  });
  if (!result.enabled) return "unavailable";
  return result.value ? "updated" : "not_found";
}

'''
    career = career.replace(marker, addition + marker, 1)
write(career_path, career)

write(
    "src/app/api/community/profile/route.ts",
    '''import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-validation";
import { getCanonicalSession } from "@/lib/auth-session";
import { verifyCsrfOrigin } from "@/lib/csrf";
import {
  COMMUNITY_PUBLIC_VISIBILITY_VALUES,
  getCurrentPublicProfile,
  setPublicVisibilityForStudent,
  type CommunityPublicVisibility,
} from "@/lib/community-career";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, {
    namespace: "community-profile",
    limit: 60,
    windowMs: 60_000,
  });
  if (!limited.ok) return apiError("rate_limited", 429);
  const profile = await getCurrentPublicProfile();
  return apiOk({ profile });
}

export async function PATCH(req: NextRequest) {
  if (!verifyCsrfOrigin(req)) return apiError("forbidden", 403);
  const session = await getCanonicalSession(req, { strictRevocation: true });
  if (!session.studentId) return apiError("academy_profile_required", 401);
  const limited = await rateLimit(req, {
    namespace: "community-profile-update",
    identity: session.studentId,
    limit: 15,
    windowMs: 60_000,
  });
  if (!limited.ok) return apiError("rate_limited", 429);
  const body = await req.json().catch(() => ({}));
  const visibility = String(body.visibility ?? "") as CommunityPublicVisibility;
  if (!COMMUNITY_PUBLIC_VISIBILITY_VALUES.includes(visibility)) {
    return apiError("invalid_visibility", 400);
  }
  const result = await setPublicVisibilityForStudent(session.studentId, visibility);
  if (result === "unavailable") return apiError("profile_storage_unavailable", 503);
  if (result === "not_found") return apiError("profile_not_found", 404);
  return apiOk({ visibility });
}
''',
)

runtime_path = "scripts/api-security-runtime-evidence.mjs"
runtime = read(runtime_path)
if "export function detectStrictRevocationCall" not in runtime:
    marker = "export function detectAuditCall(handler) {"
    if marker not in runtime:
        raise SystemExit("strict runtime evidence insertion marker missing")
    addition = '''export function detectStrictRevocationCall(handler) {
  const source = runtimeEvidenceSource(handler);
  return /strictRevocation\\s*:\\s*true|\\brevokeSessionStrict\\s*\\(|\\brequireStrictSession\\s*\\(|\\bassertSession[A-Za-z0-9_]*Strict\\s*\\(|\\bloadAdminPrincipal\\s*\\(|\\bauthorizeAdminRequest\\s*\\(/i.test(source);
}

'''
    runtime = runtime.replace(marker, addition + marker, 1)
write(runtime_path, runtime)

generator_path = "scripts/generate-api-security-manifest.mjs"
generator = read(generator_path)
if "detectStrictRevocationCall," not in generator:
    import_marker = "  detectSessionCookieWrite,\n"
    if import_marker not in generator:
        raise SystemExit("manifest strict detector import marker missing")
    generator = generator.replace(
        import_marker,
        import_marker + "  detectStrictRevocationCall,\n",
        1,
    )
lines = generator.splitlines()
replaced = False
for index, line in enumerate(lines):
    if "strictRevocation:" in line and ".test(source)" in line:
        indent = line[: len(line) - len(line.lstrip())]
        lines[index] = indent + "strictRevocation: detectStrictRevocationCall(source),"
        replaced = True
        break
if not replaced and "strictRevocation: detectStrictRevocationCall(source)," not in generator:
    raise SystemExit("manifest strict detector control line missing")
write(generator_path, "\n".join(lines) + "\n")

write(
    "scripts/api-security-strict-revocation-evidence.test.mjs",
    '''import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectStrictRevocationCall } from "./api-security-runtime-evidence.mjs";

describe("strict revocation runtime evidence", () => {
  it("rejects import-only and comment-only evidence", () => {
    assert.equal(
      detectStrictRevocationCall(`import { loadAdminPrincipal } from "x";`),
      false,
    );
    assert.equal(
      detectStrictRevocationCall(`// getCanonicalSession(req, { strictRevocation: true });`),
      false,
    );
  });

  it("rejects a canonical session call without strict revocation", () => {
    assert.equal(detectStrictRevocationCall(`await getCanonicalSession(req);`), false);
  });

  it("accepts explicit canonical and live admin authority", () => {
    assert.equal(
      detectStrictRevocationCall(
        `await getCanonicalSession(req, { strictRevocation: true });`,
      ),
      true,
    );
    assert.equal(
      detectStrictRevocationCall(`await loadAdminPrincipal(req);`),
      true,
    );
    assert.equal(
      detectStrictRevocationCall(`await authorizeAdminRequest(req, "admin:read");`),
      true,
    );
  });
});
''',
)

write(
    "scripts/check-strict-revocation-authority.mjs",
    '''import { readFile } from "node:fs/promises";

const directStrictFiles = [
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/community/profile/route.ts",
];
const sources = new Map(
  await Promise.all(
    directStrictFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);
const failures = [];
for (const [path, source] of sources) {
  if (!source.includes("strictRevocation: true")) {
    failures.push(`${path}: strict revocation evidence is missing`);
  }
  if (source.includes("getCanonicalSession(req);")) {
    failures.push(`${path}: non-strict canonical session call remains`);
  }
}

const alias = await readFile("src/app/api/ai-mentor-v2/route.ts", "utf8");
if (!alias.includes("POST as canonicalPost")) {
  failures.push("AI Mentor V2 must delegate POST to the canonical strict handler");
}

const adminLogout = await readFile("src/app/api/command-center/auth/logout/route.ts", "utf8");
if (!adminLogout.includes("loadAdminPrincipal(req)")) {
  failures.push("admin logout must resolve the live database principal");
}

const notificationPrincipal = await readFile("src/lib/notifications/principal.ts", "utf8");
if (!notificationPrincipal.includes("getCanonicalSession(request")) {
  failures.push("notification identity must use canonical session authority");
}
if (!notificationPrincipal.includes("options.strictRevocation === true")) {
  failures.push("notification identity must expose strict revocation mode");
}
for (const path of [
  "src/app/api/notifications/consent/route.ts",
  "src/app/api/notifications/preferences/route.ts",
]) {
  const source = await readFile(path, "utf8");
  if (!source.includes("strictRevocation: true")) {
    failures.push(`${path}: sensitive notification mutation must request strict identity`);
  }
}

const community = await readFile("src/app/api/community/profile/route.ts", "utf8");
if (!community.includes("setPublicVisibilityForStudent")) {
  failures.push("community visibility mutation must use the session-bound server setter");
}
if (community.includes("setCurrentPublicVisibility")) {
  failures.push("community mutation may not resolve identity inside a non-strict helper");
}

const detector = await readFile("scripts/api-security-runtime-evidence.mjs", "utf8");
if (!detector.includes("detectStrictRevocationCall")) {
  failures.push("runtime evidence must expose strict revocation detection");
}
if (!detector.includes("loadAdminPrincipal")) {
  failures.push("runtime evidence must recognize live admin principal authority");
}

if (failures.length) {
  console.error("Strict revocation authority check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Strict revocation authority check passed for all 16 governed mutations.");
''',
)

write(
    "src/tests/security/auth-strict-revocation-routes.test.ts",
    '''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const direct = [
  "src/app/api/ai-mentor/route.ts",
  "src/app/api/auth/2fa/backup/route.ts",
  "src/app/api/auth/2fa/disable/route.ts",
  "src/app/api/auth/2fa/enroll/route.ts",
  "src/app/api/auth/devices/[id]/route.ts",
  "src/app/api/auth/webauthn/credentials/[id]/route.ts",
  "src/app/api/auth/webauthn/register/verify/route.ts",
  "src/app/api/mentor-memory/route.ts",
  "src/app/api/community/profile/route.ts",
];

describe("high-risk mutation strict revocation boundaries", () => {
  it("requires explicit strict canonical sessions on every direct route", async () => {
    for (const path of direct) {
      const source = await readFile(path, "utf8");
      assert.match(source, /strictRevocation:\\s*true/, path);
      assert.doesNotMatch(source, /getCanonicalSession\\(req\\);/, path);
    }
  });

  it("keeps the AI Mentor compatibility alias on the canonical strict handler", async () => {
    const source = await readFile("src/app/api/ai-mentor-v2/route.ts", "utf8");
    assert.match(source, /POST as canonicalPost/);
    assert.match(source, /return canonicalPost\\(req\\)/);
  });

  it("uses live admin authority for command-center logout", async () => {
    const source = await readFile(
      "src/app/api/command-center/auth/logout/route.ts",
      "utf8",
    );
    assert.match(source, /loadAdminPrincipal\\(req\\)/);
    assert.match(source, /revokeAdminSession\\(principal\\.sessionId/);
  });

  it("requires strict notification identity for consent and preference mutations", async () => {
    const principal = await readFile("src/lib/notifications/principal.ts", "utf8");
    assert.match(principal, /getCanonicalSession\\(request/);
    assert.match(principal, /options\\.strictRevocation === true/);
    for (const path of [
      "src/app/api/notifications/consent/route.ts",
      "src/app/api/notifications/preferences/route.ts",
    ]) {
      const source = await readFile(path, "utf8");
      assert.match(
        source,
        /getNotificationIdentityFromRequest\\(req, \\{[\\s\\S]*strictRevocation: true/,
      );
    }
  });

  it("binds community visibility to the strict session principal", async () => {
    const route = await readFile("src/app/api/community/profile/route.ts", "utf8");
    const authority = await readFile("src/lib/community-career.ts", "utf8");
    assert.match(route, /getCanonicalSession\\(req, \\{ strictRevocation: true \\}\\)/);
    assert.match(route, /setPublicVisibilityForStudent\\(session\\.studentId, visibility\\)/);
    assert.doesNotMatch(route, /setCurrentPublicVisibility/);
    assert.match(authority, /setPublicVisibilityForStudent/);
    assert.match(authority, /WHERE student_id = \\$1::uuid/);
  });
});
''',
)

package_path = "package.json"
package = read(package_path)
old_auth = '"auth:check": "node scripts/check-auth-session-authority.mjs"'
new_auth = '"auth:check": "node scripts/check-auth-session-authority.mjs && node scripts/check-strict-revocation-authority.mjs"'
if new_auth not in package:
    if old_auth not in package:
        raise SystemExit("auth:check package script not found")
    package = package.replace(old_auth, new_auth, 1)
old_tests = "scripts/api-security-runtime-evidence.test.mjs scripts/api-security-operation-override-policy.test.mjs"
new_tests = "scripts/api-security-runtime-evidence.test.mjs scripts/api-security-strict-revocation-evidence.test.mjs scripts/api-security-operation-override-policy.test.mjs"
if new_tests not in package:
    if old_tests not in package:
        raise SystemExit("API security test command insertion point not found")
    package = package.replace(old_tests, new_tests, 1)
write(package_path, package)

print("Applied strict revocation remediation to the governed high-risk mutations.")
