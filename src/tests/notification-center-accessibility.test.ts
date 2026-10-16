import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const notificationCenterPath = new URL(
  "../components/learning-os/NotificationCenter.tsx",
  import.meta.url,
);

test("notification unread count is announced accessibly in Persian and English", async () => {
  const source = await readFile(notificationCenterPath, "utf8");

  assert.match(source, /className="sr-only"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.ok(
    source.includes('isFa ? `${unread} اعلان خوانده‌نشده` : `${unread} unread notifications`'),
    "the live announcement must preserve the exact Persian and English unread-count copy",
  );
});

test("notification unread announcement remains a status, not an assertive interruption", async () => {
  const source = await readFile(notificationCenterPath, "utf8");

  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /aria-live="assertive"/);
});
