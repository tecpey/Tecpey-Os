import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  errorTrackingStatus,
  isErrorTrackingConfigured,
  assertErrorTrackingProviderOperational,
} from "../../lib/error-tracking";

// ERROR_TRACKING_PROVIDER=sentry was an accepted value whose capture function is
// a stub: it forwarded nothing and logged locally. Worse, isErrorTrackingConfigured
// returned true for it, and /api/health reports that field — while the deployment
// contract routes traffic on the health response. So the signal that authorises
// traffic vouched for observability the platform did not have, and an operator
// would discover it during an incident.
//
// This is the SB-016 shape on the observability path: a setting that reports a
// capability instead of providing it.

const ORIGINAL = process.env.ERROR_TRACKING_PROVIDER;

function withProvider(value: string | undefined, run: () => void): void {
  try {
    if (value === undefined) delete process.env.ERROR_TRACKING_PROVIDER;
    else process.env.ERROR_TRACKING_PROVIDER = value;
    run();
  } finally {
    if (ORIGINAL === undefined) delete process.env.ERROR_TRACKING_PROVIDER;
    else process.env.ERROR_TRACKING_PROVIDER = ORIGINAL;
  }
}

test("an unimplemented provider is never reported as configured", () => {
  withProvider("sentry", () => {
    assert.equal(
      isErrorTrackingConfigured(),
      false,
      "health must not vouch for a provider that forwards nothing",
    );
  });
});

test("health distinguishes no provider from an inert one", () => {
  // Collapsing these hides the case that actually needs an operator: someone
  // believes tracking is on. "unconfigured" is a known state; "misconfigured" is
  // a false belief.
  withProvider(undefined, () => assert.equal(errorTrackingStatus(), "unconfigured"));
  withProvider("sentry", () => assert.equal(errorTrackingStatus(), "misconfigured"));
  withProvider("betterstack", () => assert.equal(errorTrackingStatus(), "configured"));
});

test("an inert provider fails loudly at the configuration boundary", () => {
  withProvider("sentry", () => {
    assert.throws(
      () => assertErrorTrackingProviderOperational(),
      /error_tracking_provider_not_implemented:sentry/,
    );
  });
  // A working provider and an absent one are both legitimate configurations.
  withProvider("betterstack", () => assertErrorTrackingProviderOperational());
  withProvider(undefined, () => assertErrorTrackingProviderOperational());
});

test("the environment contract rejects the inert provider before deployment", () => {
  // The runtime assertion above only helps a process that already booted. The env
  // contract runs first in both CI and the deployment sequence, so the refusal
  // belongs there too — that is the boundary where a misconfiguration is cheap.
  const validator = readFileSync("scripts/validate-env.mjs", "utf8");
  assert.match(validator, /ERROR_TRACKING_UNIMPLEMENTED/);
  assert.match(validator, /is not implemented and forwards nothing/);
  // betterstack without its token would silently fall back to local logs, which
  // is the same failure wearing a different name.
  assert.match(validator, /ERROR_TRACKING_PROVIDER=betterstack requires BETTERSTACK_SOURCE_TOKEN/);
});

test("the health route reports the three-state status, not a boolean", () => {
  const health = readFileSync("src/app/api/health/route.ts", "utf8");
  assert.match(health, /errorTracking: errorTrackingStatus\(\)/);
  assert.ok(
    !health.includes("isErrorTrackingConfigured()"),
    "health must not collapse an inert provider back into a configured/unconfigured boolean",
  );
});

test("a non-canonical provider value resolves the same way everywhere", () => {
  // A quoted .env value like " betterstack " used to pass the environment
  // contract, which trims, and then resolve to "none" at runtime, which did not.
  // The deployment check went green while the process forwarded nothing — the
  // same class of lie this module exists to remove, one layer down.
  withProvider(" betterstack ", () => {
    assert.equal(errorTrackingStatus(), "configured");
    assert.equal(isErrorTrackingConfigured(), true);
  });
  withProvider("  SENTRY  ", () => {
    assert.equal(errorTrackingStatus(), "misconfigured");
    assert.throws(
      () => assertErrorTrackingProviderOperational(),
      /error_tracking_provider_not_implemented:sentry/,
    );
  });
});

test("the operator runbook does not recommend a provider preflight rejects", () => {
  // An operator following the runbook must not be sent into a configuration the
  // governed preflight refuses. Documentation that contradicts an enforced gate
  // wastes an incident-time hour finding out.
  const runbook = readFileSync("docs/OPERATIONS_RUNBOOK.md", "utf8");
  const providerLines = runbook
    .split("\n")
    .filter((line) => line.includes("ERROR_TRACKING_PROVIDER"));
  assert.ok(providerLines.length > 0, "the runbook must document the provider setting");
  for (const line of providerLines) {
    assert.ok(
      !/`sentry`(?!.*(not implemented|reject))/i.test(line),
      `the runbook still offers sentry as a usable value: ${line}`,
    );
  }
});
