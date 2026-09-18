import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { ensureOperationalSpoolDirectories } from "@/lib/ops/operational-alert-spool";
import { transitionOperationalConditionSignal } from "@/lib/ops/operational-condition-signal";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "tecpey-condition-signal-"),
  );
  roots.push(root);
  return root;
}

function observation(
  stateDirectory: string,
  input: {
    status: "healthy" | "warning" | "critical";
    reasonCodes?: string[];
    observedAt?: string;
  },
) {
  return {
    stateDirectory,
    source: "mentor-profile-health",
    sourceUnit: "tecpey-mentor-profile-health.service",
    hostName: "condition-test",
    condition: "projection-health",
    status: input.status,
    observedAt: input.observedAt ?? "2026-09-18T12:00:00.000Z",
    reasonCodes: input.reasonCodes ?? [],
    counters: {
      ready_backlog: input.status === "critical" ? 500 : 0,
      unresolved_dead_letters: input.status === "critical" ? 1 : 0,
    },
    gauges: {
      oldest_ready_age_seconds: input.status === "critical" ? 301 : null,
    },
  } as const;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    ),
  );
});

test("critical condition emits once, deduplicates, changes incident, then resolves", async () => {
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

  const replay = await transitionOperationalConditionSignal(
    observation(root, {
      status: "critical",
      reasonCodes: ["dead_letter_present"],
      observedAt: "2026-09-18T12:01:00.000Z",
    }),
  );
  assert.equal(replay.active, true);
  assert.deepEqual(replay.emitted, []);

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
  assert.notEqual(changed.emitted[1]?.incidentId, firstIncidentId);
  const secondIncidentId = changed.emitted[1]!.incidentId;

  const healthy = await transitionOperationalConditionSignal(
    observation(root, {
      status: "healthy",
      observedAt: "2026-09-18T12:03:00.000Z",
    }),
  );
  assert.equal(healthy.active, false);
  assert.equal(healthy.emitted.length, 1);
  assert.equal(healthy.emitted[0]?.lifecycle, "resolved");
  assert.equal(healthy.emitted[0]?.incidentId, secondIncidentId);
  assert.deepEqual(healthy.emitted[0]?.reasonCodes, ["condition_recovered"]);

  const dirs = await ensureOperationalSpoolDirectories(root);
  const pending = await readdir(dirs.pending);
  assert.equal(pending.length, 4);
  const activeDir = path.join(root, "signals", "active");
  assert.deepEqual(await readdir(activeDir), []);

  for (const name of pending) {
    const parsed = JSON.parse(
      await readFile(path.join(dirs.pending, name), "utf8"),
    ) as { signal?: Record<string, unknown> };
    const serialized = JSON.stringify(parsed.signal ?? {});
    assert.doesNotMatch(
      serialized,
      /studentId|tenantId|workspaceId|conversation|prompt|portfolio|kyc/i,
    );
  }
});

test("warning does not open an incident or page when none is active", async () => {
  const root = await tempRoot();
  const warning = await transitionOperationalConditionSignal(
    observation(root, {
      status: "warning",
      reasonCodes: ["ready_backlog_warning"],
    }),
  );
  assert.deepEqual(warning, {
    active: false,
    emitted: [],
    replayed: 0,
  });
  const dirs = await ensureOperationalSpoolDirectories(root);
  assert.deepEqual(await readdir(dirs.pending), []);
});
