import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requiredWorkerReadiness } from "../../lib/runtime-readiness";

// server.ts started the withdrawal workers on two conditions and reported their
// readiness from one:
//
//   if (redisUrl && custodyStatus.workerEnabled) { …start… }
//   requiredWorkers: custodyStatus.workerEnabled ? "ready" : "disabled"
//
// So custody enabled without REDIS_URL started nothing while /api/health
// published requiredWorkers: "ready". Same shape as the health fields corrected
// in #516, #518 and #520 — a signal reporting that a capability was *asked for*
// rather than that it is *there* — and this one is in the dangerous direction.
//
// In production the gap is currently masked: health also fails closed when Redis
// is unreachable, so the response would be unhealthy for that reason instead. A
// report that happens to be covered by a neighbouring control is still a report
// that can disagree with reality, and nothing kept the two expressions in step.

const SERVER = readFileSync("server.ts", "utf8");

test("readiness distinguishes deliberate absence from failure to start", () => {
  // "disabled" is a posture the operator chose. "starting" is health's critical
  // production state. Collapsing the second into the first is what let an
  // instance that cannot execute a withdrawal stay in the load balancer.
  assert.equal(requiredWorkerReadiness(false, false), "disabled");
  assert.equal(requiredWorkerReadiness(true, true), "ready");
  assert.equal(
    requiredWorkerReadiness(true, false),
    "starting",
    "workers required but not running must not be reported as ready or as disabled",
  );
});

test("workers that are not required cannot be reported as failing", () => {
  // The inverse mistake: reporting "starting" for a custody-disabled deployment
  // would make health critical in production for a configuration that is correct,
  // and an alarm that fires on a healthy posture gets muted.
  assert.equal(requiredWorkerReadiness(false, true), "disabled");
  assert.equal(requiredWorkerReadiness(false, false), "disabled");
});

test("the reported value is never a state health cannot interpret", () => {
  for (const required of [true, false]) {
    for (const running of [true, false]) {
      assert.ok(
        ["ready", "disabled", "starting"].includes(requiredWorkerReadiness(required, running)),
        `unexpected readiness for required=${required} running=${running}`,
      );
    }
  }
});

test("server.ts reports from the worker handle, not from the flag", () => {
  // The property that actually closes the gap. withdrawalWorkers is assigned only
  // inside the successful start branch, so reading it is reading whether the
  // workers exist. Reading custodyStatus.workerEnabled alone is reading whether
  // somebody asked for them.
  assert.match(
    SERVER,
    /requiredWorkers: requiredWorkerReadiness\(\s*custodyStatus\.workerEnabled,\s*withdrawalWorkers !== null,\s*\)/,
    "readiness must be derived from the worker module handle",
  );
  assert.ok(
    !/requiredWorkers: custodyStatus\.workerEnabled \? "ready"/.test(SERVER),
    "readiness must not be re-derived from the flag alone",
  );
});

test("the start condition and the readiness report stay in step", () => {
  // Two consumers of one decision is how this diverged. If a third condition is
  // added to the start branch, the handle keeps telling the truth — but only while
  // the handle is assigned exclusively inside that branch, which is what this
  // checks.
  const startBranch = SERVER.match(
    /if \(redisUrl && custodyStatus\.workerEnabled\) \{([\s\S]*?)\n  \} else if/,
  );
  assert.ok(startBranch, "the withdrawal worker start branch must still be identifiable");
  assert.match(
    startBranch[1],
    /withdrawalWorkers = await import/,
    "the handle must be assigned inside the start branch",
  );
  const assignments = SERVER.match(/withdrawalWorkers\s*=\s*(?!null)/g) ?? [];
  assert.equal(
    assignments.length,
    1,
    `withdrawalWorkers must be assigned in exactly one place, found ${assignments.length}`,
  );
});
