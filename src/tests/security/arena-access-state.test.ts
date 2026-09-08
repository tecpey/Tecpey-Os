import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveArenaAccessGate, resolveArenaSessionError } from "../../lib/arena-access-state";

test("revocation outage wins over every apparent identity state", () => {
  for (const studentId of [null, "student-1"]) {
    for (const isAcademyUser of [false, true]) {
      assert.deepEqual(resolveArenaSessionError({ authorityDegraded: true, studentId, isAcademyUser }),
        { code: "arena_session_unavailable", status: 503 });
    }
  }
});

test("guest, authenticated account and student have distinct recovery paths", () => {
  assert.deepEqual(resolveArenaSessionError({ authorityDegraded: false, studentId: null, isAcademyUser: false }),
    { code: "academy_login_required", status: 401 });
  assert.deepEqual(resolveArenaSessionError({ authorityDegraded: false, studentId: null, isAcademyUser: true }),
    { code: "academy_profile_required", status: 401 });
  assert.equal(resolveArenaSessionError({ authorityDegraded: false, studentId: "student-1", isAcademyUser: true }), null);
});

test("only explicit 401 profile decisions lead to onboarding", () => {
  assert.equal(resolveArenaAccessGate("academy_profile_required", 401), "profile");
  for (const code of [null, undefined, "unknown", "academy_login_required"]) {
    assert.equal(resolveArenaAccessGate(code, 401), "login");
  }
  for (const status of [403, 429, 500, 503]) {
    assert.equal(resolveArenaAccessGate("academy_profile_required", status), "error");
    assert.equal(resolveArenaAccessGate("arena_session_unavailable", status), "error");
  }
});
