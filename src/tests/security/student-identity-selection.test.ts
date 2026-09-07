import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { findStudentCartaxProfile, upsertStudentCartax } from "../../lib/student-cartax";

test("signed student identity excludes an unrelated email from reads", async () => {
  await findStudentCartaxProfile({ query: async (sql, values) => {
    assert.deepEqual(values, ["11111111-1111-4111-8111-111111111111"]);
    assert.doesNotMatch(sql, /s\.email =/);
    return { rows: [] };
  } }, { studentId: "11111111-1111-4111-8111-111111111111", email: "other@example.test" });
});

test("ambiguous profile reads fail closed", async () => {
  await assert.rejects(findStudentCartaxProfile({ query: async () => ({ rows: [{ id: "one" }, { id: "two" }] }) },
    { email: "ambiguous@example.test" }), /academy_student_identity_ambiguous/);
});

test("ambiguous identity selection never reaches a write", async () => {
  let calls = 0;
  await assert.rejects(upsertStudentCartax({ query: async () => {
    calls++;
    return { rows: [{ id: "one" }, { id: "two" }] };
  } }, { email: "one@example.test", phone: "+10000000000" }), /academy_student_identity_ambiguous/);
  assert.equal(calls, 1);
});

test("missing signed student does not create a replacement profile", async () => {
  let calls = 0;
  await assert.rejects(upsertStudentCartax({ query: async () => {
    calls++;
    return { rows: [] };
  } }, {}, "11111111-1111-4111-8111-111111111111"), /academy_student_identity_missing/);
  assert.equal(calls, 1);
});

test("editable username is not passed to the identity lookup", async () => {
  const stop = new Error("stop before persistence");
  let calls = 0;
  await assert.rejects(upsertStudentCartax({ query: async (sql, values) => {
    calls++;
    if (calls === 1) {
      assert.doesNotMatch(sql, /username\s*=/);
      assert.ok(!values?.includes("another-learner"));
      assert.match(sql, /LIMIT 2/);
      return { rows: [] };
    }
    throw stop;
  } }, { email: "own@example.test", username: "another-learner" }), error => error === stop);
  assert.equal(calls, 2);
});

test("profile form route cannot provide email, phone or OAuth ownership claims", async () => {
  const source = await readFile(new URL("../../app/api/academy-student-profile/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /body\.(email|phone|googleId|appleId)/);
  assert.match(source, /const email = session\.email/);
  assert.match(source, /phone_verified_at IS NOT NULL/);
});
