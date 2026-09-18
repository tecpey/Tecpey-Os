import assert from "node:assert/strict";
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  transitionOperationalConditionSignal,
  type OperationalConditionObservation,
} from "@/lib/ops/operational-condition-signal";
import {
  enqueueOperationalSignal,
  ensureOperationalSignalSpoolDirectories,
} from "@/lib/ops/operational-signal-spool";
import type { OperationalSignalEvidence } from "@/lib/ops/operational-signal-evidence";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-signal-lifecycle-"));
  roots.push(root);
  return root;
}

function observation(
  stateDirectory: string,
  input: {
    status: "healthy" | "warning" | "critical";
    reasonCodes?: readonly string[];
    observedAt?: string;
  },
): OperationalConditionObservation {
  return {
    stateDirectory,
    signalType: "mentor_profile_projection_health",
    component: "mentor_profile_projection",
    sourceUnit: "tecpey-mentor-profile-health.service",
    status: input.status,
    observedAt: input.observedAt ?? "2026-09-18T12:00:00.000Z",
    reasonCodes: input.reasonCodes ?? [],
    measurements: {
      ready_backlog: input.status === "critical" ? 500 : 0,
      unresolved_dead_letters: input.status === "critical" ? 1 : 0,
      oldest_ready_age_seconds: input.status === "critical" ? 301 : null,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("condition lifecycle deduplicates steady critical state, rotates changed causes, resolves, and permits same-hour recurrence", async () => {
  const root = await tempRoot();

  const first = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
    }),
  );
  assert.equal(first.active, true);
  assert.equal(first.emitted.length, 1);
  assert.equal(first.emitted[0]?.lifecycle, "firing");
  const firstIncidentId = first.emitted[0]!.incidentId;
  const firstFiringId = first.emitted[0]!.signalId;

  const steady = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
      observedAt: "2026-09-18T12:01:00.000Z",
    }),
  );
  assert.equal(steady.active, true);
  assert.deepEqual(steady.emitted, []);

  const changed = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["lease_overdue_critical"],
      observedAt: "2026-09-18T12:02:00.000Z",
    }),
  );
  assert.equal(changed.active, true);
  assert.equal(changed.emitted.length, 2);
  assert.equal(changed.emitted[0]?.lifecycle, "resolved");
  assert.equal(changed.emitted[0]?.incidentId, firstIncidentId);
  assert.equal(changed.emitted[1]?.lifecycle, "firing");
  const secondIncidentId = changed.emitted[1]!.incidentId;
  assert.notEqual(secondIncidentId, firstIncidentId);

  const warning = await transitionOperationalConditionSignal(
    observation(root, {
      status: "warning",
      reasonCodes: ["ready_backlog_warning"],
      observedAt: "2026-09-18T12:03:00.000Z",
    }),
  );
  assert.equal(warning.active, false);
  assert.equal(warning.emitted.length, 1);
  assert.equal(warning.emitted[0]?.lifecycle, "resolved");
  assert.equal(warning.emitted[0]?.incidentId, secondIncidentId);

  const recurrence = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
      observedAt: "2026-09-18T12:04:00.000Z",
    }),
  );
  assert.equal(recurrence.active, true);
  assert.equal(recurrence.emitted.length, 1);
  assert.equal(recurrence.emitted[0]?.lifecycle, "firing");
  assert.notEqual(recurrence.emitted[0]?.incidentId, firstIncidentId);
  assert.notEqual(recurrence.emitted[0]?.signalId, firstFiringId);

  const dirs = await ensureOperationalSignalSpoolDirectories(root);
  const pending = await readdir(dirs.pending);
  assert.equal(pending.length, 5);

  const conditionDir = path.join(root, "signals", "conditions");
  const conditionEntries = await readdir(conditionDir);
  assert.equal(conditionEntries.length, 1);
  const conditionStat = await lstat(path.join(conditionDir, conditionEntries[0]!));
  assert.equal(conditionStat.mode & 0o777, 0o600);
  const directoryStat = await lstat(conditionDir);
  assert.equal(directoryStat.mode & 0o777, 0o700);
});

test("write-ahead pending transition replays the exact signal after an enqueue failure", async () => {
  const root = await tempRoot();
  const seenBeforeCrash: OperationalSignalEvidence[] = [];

  await assert.rejects(
    transitionOperationalConditionSignal(
      observation(root, {
        status: "critical",
        reasonCodes: ["dead_letter_present"],
      }),
      {
        enqueue: async (_stateDirectory, signal) => {
          seenBeforeCrash.push(signal);
          throw new Error("simulated_enqueue_crash");
        },
      },
    ),
    /simulated_enqueue_crash/,
  );
  assert.equal(seenBeforeCrash.length, 1);

  const seenDuringRecovery: OperationalSignalEvidence[] = [];
  const recovered = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
      observedAt: "2026-09-18T12:01:00.000Z",
    }),
    {
      enqueue: async (_stateDirectory, signal) => {
        seenDuringRecovery.push(signal);
        return { replayed: true, filePath: "/tmp/replayed-signal.json" };
      },
    },
  );

  assert.equal(recovered.recoveredPending, true);
  assert.equal(recovered.active, true);
  assert.equal(recovered.replayed, 1);
  assert.deepEqual(recovered.emitted, []);
  assert.equal(seenDuringRecovery.length, 1);
  assert.deepEqual(seenDuringRecovery[0], seenBeforeCrash[0]);
});

test("cause-change crash after resolving the old incident replays the full transition sequence", async () => {
  const root = await tempRoot();
  const initial = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
    }),
  );
  const oldIncidentId = initial.emitted[0]!.incidentId;

  const attempted: OperationalSignalEvidence[] = [];
  let calls = 0;
  await assert.rejects(
    transitionOperationalConditionSignal(
      observation(root, {
        status: "critical",
        reasonCodes: ["lease_overdue_critical"],
        observedAt: "2026-09-18T12:02:00.000Z",
      }),
      {
        enqueue: async (stateDirectory, signal) => {
          attempted.push(signal);
          calls += 1;
          if (calls === 2) {
            throw new Error("simulated_second_enqueue_crash");
          }
          return enqueueOperationalSignal(stateDirectory, signal);
        },
      },
    ),
    /simulated_second_enqueue_crash/,
  );

  assert.equal(attempted.length, 2);
  assert.equal(attempted[0]!.lifecycle, "resolved");
  assert.equal(attempted[0]!.incidentId, oldIncidentId);
  assert.equal(attempted[1]!.lifecycle, "firing");
  const newIncidentId = attempted[1]!.incidentId;
  assert.notEqual(newIncidentId, oldIncidentId);

  const recovered = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["lease_overdue_critical"],
      observedAt: "2026-09-18T12:03:00.000Z",
    }),
  );
  assert.equal(recovered.recoveredPending, true);
  assert.equal(recovered.active, true);
  assert.equal(recovered.replayed >= 1, true);
  assert.deepEqual(recovered.emitted, []);

  const dirs = await ensureOperationalSignalSpoolDirectories(root);
  const pending = await readdir(dirs.pending);
  assert.equal(pending.length, 3);

  const bodies = await Promise.all(
    pending.map(async (name) =>
      JSON.parse(
        await (await import("node:fs/promises")).readFile(
          path.join(dirs.pending, name),
          "utf8",
        ),
      ) as { signal: OperationalSignalEvidence }),
  );
  const signals = bodies.map((item) => item.signal);
  assert.equal(
    signals.some(
      (signal) =>
        signal.lifecycle === "resolved" &&
        signal.incidentId === oldIncidentId,
    ),
    true,
  );
  assert.equal(
    signals.some(
      (signal) =>
        signal.lifecycle === "firing" &&
        signal.incidentId === newIncidentId,
    ),
    true,
  );
});

test("warning or healthy observation never opens a durable incident from idle", async () => {
  const root = await tempRoot();

  for (const status of ["warning", "healthy"] as const) {
    const result = await transitionOperationalConditionSignal(
      observation(root, {
        status,
        reasonCodes:
          status === "warning" ? ["ready_backlog_warning"] : [],
      }),
    );
    assert.deepEqual(result, {
      active: false,
      emitted: [],
      replayed: 0,
      recoveredPending: false,
    });
  }

  const dirs = await ensureOperationalSignalSpoolDirectories(root);
  assert.deepEqual(await readdir(dirs.pending), []);
  const conditionDir = path.join(root, "signals", "conditions");
  assert.deepEqual(await readdir(conditionDir), []);
});

test("condition state never serializes high-cardinality learner or tenant fields", async () => {
  const root = await tempRoot();
  await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["terminal_projection_failure"],
    }),
  );

  const conditionDir = path.join(root, "signals", "conditions");
  const entry = (await readdir(conditionDir))[0]!;
  const { readFile } = await import("node:fs/promises");
  const serialized = await readFile(path.join(conditionDir, entry), "utf8");
  assert.doesNotMatch(
    serialized,
    /student|tenant|workspace|conversation|prompt|portfolio|kyc|email|phone/i,
  );
});
