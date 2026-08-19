import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeNotificationCopy,
  findForbiddenNotificationCopy,
} from "../lib/notifications/copy-safety";

// The governance non-negotiable's three unsafe example hooks
// (docs/engineering/governance/TECPEY_PRODUCT_COMPLETION_AND_C_LEVEL_GOVERNANCE.md).
const GOVERNANCE_UNSAFE_HOOKS: ReadonlyArray<[string, string]> = [
  ["الان وارد شو تا سود نکنی جا می‌مونی", "fomo-panic"],
  ["بازار همین الان منفجر می‌شود", "fomo-panic"],
  ["با این سیگنال رتبه‌ات را بترکون", "gambling-reckless"],
];

const SAFE_COPY: ReadonlyArray<string> = [
  "درس بعدی آکادمی آماده است",
  "«${title}» تا پایان بررسی از ویترین عمومی خارج شد.",
  "Your next Academy lesson is ready",
  "A new sign-in was recorded. If this was not you, review your sessions.",
  "نتیجه ارزیابی ثبت شد",
];

test("findForbiddenNotificationCopy flags each governance-banned hook with its category", () => {
  for (const [copy, category] of GOVERNANCE_UNSAFE_HOOKS) {
    const hit = findForbiddenNotificationCopy(copy);
    assert.ok(hit, `expected a forbidden hit for: ${copy}`);
    assert.equal(hit?.category, category);
  }
});

test("findForbiddenNotificationCopy leaves legitimate copy untouched", () => {
  for (const copy of SAFE_COPY) {
    assert.equal(findForbiddenNotificationCopy(copy), null, `unexpected hit: ${copy}`);
  }
});

test("assertSafeNotificationCopy fails closed on an unsafe title", () => {
  assert.throws(
    () => assertSafeNotificationCopy({ title: "سود قطعی همین امروز", body: "متن سالم" }),
    /notification_copy_unsafe:title:profit-promise/,
  );
});

test("assertSafeNotificationCopy fails closed on an unsafe body", () => {
  assert.throws(
    () => assertSafeNotificationCopy({ title: "عنوان سالم", body: "این سیگنال خرید را از دست نده" }),
    /notification_copy_unsafe:body:trade-signal/,
  );
});

test("assertSafeNotificationCopy allows real notification copy", () => {
  assert.doesNotThrow(() =>
    assertSafeNotificationCopy({
      title: "گواهی آکادمی صادر شد",
      body: "گواهی «تحلیل مقدماتی» صادر شد و در پروفایل آموزشی شما آماده مشاهده است.",
    }),
  );
});

test("runtime enforcement catches payload-injected copy that the source scan cannot see", () => {
  // A credential title read from the database (not authored in source) that
  // carries a forbidden hook must still be rejected at the creation boundary.
  const injectedCredentialTitle = "مدال جا نمونی";
  assert.throws(
    () =>
      assertSafeNotificationCopy({
        title: "افتخار جدید در پروفایل تو ثبت شد",
        body: `«${injectedCredentialTitle}» در ویترین مدارک و مدال‌های تو ثبت شد.`,
      }),
    /notification_copy_unsafe:body:fomo-panic/,
  );
});
