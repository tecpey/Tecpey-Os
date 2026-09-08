import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolveAcademyStudentSessionIdentity } from "../../lib/security/academy-student-session-identity";

type Services = NonNullable<Parameters<typeof resolveAcademyStudentSessionIdentity>[2]>;
const request = { headers: { get: () => null } };
const studentId = "11111111-1111-4111-8111-111111111111";
const match = { student_id: studentId, email_matches: true, phone_matches: true };
function services(overrides: Partial<Services> = {}): Services {
  return {
    candidates: async () => [match],
    assertion: async () => ({ status: "none" }),
    binding: async () => ({ available: true, tenantId: "tenant-a", workspaceId: "main",
      principalType: "student", principalId: studentId, roles: [], scopes: [],
      bindingSource: "test", bindingStatus: "active", membershipId: null,
      requestId: "test", authEvidence: { strictRevocation: true, sessionPrincipal: true } }),
    ...overrides,
  };
}
test("unique verified email and phone plus active binding resolves the student", async () => {
  assert.deepEqual(await resolveAcademyStudentSessionIdentity(request, "account-a", services()),
    { status: "resolved", studentId });
});
test("unlinked account stays account-only without creating or binding a student", async () => {
  assert.deepEqual(await resolveAcademyStudentSessionIdentity(request, "account-a", services({
    candidates: async () => [], binding: async () => { throw new Error("must not run"); },
  })), { status: "unlinked", studentId: null });
});
test("partial evidence and duplicate matches require review", async () => {
  for (const rows of [[{ ...match, phone_matches: false }], [{ ...match, email_matches: false }], [match, match]]) {
    assert.equal((await resolveAcademyStudentSessionIdentity(request, "account-a", services({ candidates: async () => rows }))).status, "conflict");
  }
});
test("foreign tenant is refused before resolving a binding", async () => {
  let calls = 0;
  assert.equal((await resolveAcademyStudentSessionIdentity(request, "account-a", services({
    assertion: async () => ({ status: "foreign_host" }),
    binding: async () => { calls++; throw new Error("must not run"); },
  }))).status, "conflict");
  assert.equal(calls, 0);
});
test("revoked and missing bindings do not grant a student identity", async () => {
  for (const reason of ["binding_revoked", "binding_missing", "workspace_mismatch"] as const) {
    assert.equal((await resolveAcademyStudentSessionIdentity(request, "account-a", services({
      binding: async () => ({ available: false, reason }),
    }))).status, "conflict");
  }
});
test("storage errors are unavailable, never successful account-only recovery", async () => {
  for (const overrides of [
    { candidates: async () => null },
    { candidates: async () => { throw new Error("database outage"); } },
    { binding: async () => ({ available: false as const, reason: "binding_storage_unavailable" as const }) },
  ]) {
    assert.equal((await resolveAcademyStudentSessionIdentity(request, "account-a", services(overrides))).status, "unavailable");
  }
});
test("asserted tenant and workspace reach the binding resolver unchanged", async () => {
  const assertion = { status: "asserted" as const, tenantId: "tenant-a", workspaceId: "main" };
  const normal = services();
  await resolveAcademyStudentSessionIdentity(request, "account-a", services({
    assertion: async () => assertion,
    binding: async (id, received) => {
      assert.equal(id, studentId); assert.deepEqual(received, assertion);
      return normal.binding(id, received);
    },
  }));
});
test("all three issuers resolve student identity before signing", async () => {
  for (const path of ["academy-auth", "auth/refresh", "auth/2fa/verify"]) {
    const source = await readFile(new URL(`../../app/api/${path}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /await resolveAcademyStudentSessionIdentity\(req, account\./);
    assert.match(source, /studentId: studentIdentity\.studentId/);
    assert.doesNotMatch(source, /studentId: null,/);
    assert.ok(source.indexOf('studentIdentity.status === "unavailable"') < source.indexOf("const accessToken = await signUnifiedSession"));
  }
});
