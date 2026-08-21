import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isEmailConfigured, sendEmail } from "../../lib/email";

// Third instance of the pattern behind #516 and #518: a health field claiming a
// capability rather than providing it. isEmailConfigured was already stronger
// than those two — it checked the provider *and* its key — but it lowercased
// EMAIL_PROVIDER without trimming, and accepted any non-empty key.
//
// sendEmail resolved the variable independently and identically, so the two were
// consistent only by both being wrong the same way. Any caller that trimmed
// correctly would have disagreed with both.

const KEYS = ["EMAIL_PROVIDER", "RESEND_API_KEY", "SENDGRID_API_KEY"] as const;

// Stands in for a finished credential. Deliberately not shaped like one: the
// repository's secret scan flags a high-entropy literal beside a *_API_KEY name,
// and a fixture is not worth teaching that gate to overlook the shape. Nothing
// here depends on the value beyond it being non-empty and not a placeholder.
const SUPPLIED = "unit-test-value";
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function withEnv<T>(values: Partial<Record<(typeof KEYS)[number], string>>, run: () => T): T {
  try {
    for (const key of KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    return run();
  } finally {
    for (const key of KEYS) {
      const previous = ORIGINAL[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}

test("a provider with a real key is configured", () => {
  withEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
  withEnv({ EMAIL_PROVIDER: "sendgrid", SENDGRID_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
});

test("a non-canonical provider value resolves the same as the canonical one", () => {
  // The bug review caught in #516, in a third module.
  withEnv({ EMAIL_PROVIDER: " resend ", RESEND_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true, "surrounding whitespace must not silently disable email");
  });
  withEnv({ EMAIL_PROVIDER: "SendGrid", SENDGRID_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), true);
  });
});

test("a placeholder key is not a credential", () => {
  for (const key of ["CHANGE_ME", "your-real-key-here", "REPLACE_WITH_KEY"]) {
    withEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: key }, () => {
      assert.equal(isEmailConfigured(), false, `${key} must not count as configured`);
    });
  }
  withEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "   " }, () => {
    assert.equal(isEmailConfigured(), false, "a whitespace-only key is not a key");
  });
});

test("a provider without its own key is not configured", () => {
  // The keys are not interchangeable: sendgrid configured with only a Resend key
  // would report ready and then fail every send.
  withEnv({ EMAIL_PROVIDER: "sendgrid", RESEND_API_KEY: SUPPLIED }, () => {
    assert.equal(isEmailConfigured(), false);
  });
  withEnv({ EMAIL_PROVIDER: "resend" }, () => assert.equal(isEmailConfigured(), false));
  withEnv({}, () => assert.equal(isEmailConfigured(), false));
});

test("sending refuses the same key health refuses, without a network round-trip", async () => {
  // The other direction of the same divergence. isEmailConfigured() rejecting a
  // placeholder key while sendViaResend accepted it would leave health warning
  // that email is down while every send still reached out to collect a 401 the
  // caller sees only as a generic HTTP error.
  //
  // fetch is replaced with a throwing stub: an attempted delivery must surface as
  // a failure of this test, not as a silent network call.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("email must not attempt delivery with an unusable key");
  }) as typeof fetch;
  try {
    for (const [provider, keyName] of [
      ["resend", "RESEND_API_KEY"],
      ["sendgrid", "SENDGRID_API_KEY"],
    ] as const) {
      const result = await withEnv(
        { EMAIL_PROVIDER: provider, [keyName]: "CHANGE_ME" },
        () => sendEmail({ to: "u@tecpey.ir", subject: "s", text: "t" }),
      );
      assert.equal(result.ok, false, `${provider} must not report a placeholder send as delivered`);
      assert.equal(result.provider, provider);
      assert.match(result.error ?? "", /not set/);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sending and reporting read the same provider resolution", () => {
  // They previously agreed only because both were wrong identically. Whoever
  // answers "which provider is this" must now be one function.
  const source = readFileSync("src/lib/email.ts", "utf8");
  const independent = source.match(/process\.env\.EMAIL_PROVIDER/g) ?? [];
  assert.equal(
    independent.length,
    1,
    `EMAIL_PROVIDER must be read in exactly one place, found ${independent.length}`,
  );
  assert.match(source, /const provider = resolveEmailProvider\(\);/);
});
