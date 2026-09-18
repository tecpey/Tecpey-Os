import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  deliverOperationalAlerts,
  enqueueOperationalSignal,
  ensureOperationalSpoolDirectories,
  operationalDeliveryRetryDelayMs,
  reconcileOperationalSignalIncident,
} from "@/lib/ops/operational-alert-spool";
import type { OperationalSignalEvidence } from "@/lib/ops/operational-signal-evidence";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecpey-ops-signal-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function observation(
  status: "healthy" | "warning" | "critical" | "authority_unavailable",
  observedAt: string,
  reasonCodes: readonly string[],
  readyBacklog: number,
) {
  return {
    source: "mentor-profile-health",
    sourceUnit: "tecpey-mentor-profile-health.service",
    hostName: "mentor-signal-test",
    status,
    observedAt,
    reasonCodes,
    details: {
      policyVersion: "2026-09-18.3",
      readyBacklog,
      unresolvedDeadLetters: status === "critical" ? 1 : 0,
    },
  } as const;
}

async function pendingSignals(root: string): Promise<OperationalSignalEvidence[]> {
  const dirs = await ensureOperationalSpoolDirectories(root);
  const names = await readdir(dirs.pending);
  const signals: OperationalSignalEvidence[] = [];
  for (const name of names) {
    const item = JSON.parse(
      await readFile(path.join(dirs.pending, name), "utf8"),
    ) as { schemaVersion: number; signal?: OperationalSignalEvidence };
    if (item.schemaVersion === 2 && item.signal) signals.push(item.signal);
  }
  return signals.sort((left, right) => left.sequence - right.sequence);
}

describe("Generic operational signal rail", () => {
  it("opens, deduplicates, updates and recovers one incident without alert storms", async () => {
    const root = await tempRoot();

    const opened = await reconcileOperationalSignalIncident(
      root,
      observation(
        "warning",
        "2026-09-18T10:00:00.000Z",
        ["ready_backlog_warning"],
        50,
      ),
    );
    assert.equal(opened.emitted, true);
    assert.equal(opened.phase, "opened");
    assert.equal(opened.sequence, 1);

    const duplicate = await reconcileOperationalSignalIncident(
      root,
      observation(
        "warning",
        "2026-09-18T10:01:00.000Z",
        ["ready_backlog_warning"],
        75,
      ),
    );
    assert.equal(duplicate.emitted, false);
    assert.equal(duplicate.incidentId, opened.incidentId);
    assert.equal((await pendingSignals(root)).length, 1);

    const updated = await reconcileOperationalSignalIncident(
      root,
      observation(
        "critical",
        "2026-09-18T10:02:00.000Z",
        ["dead_letter_present", "ready_backlog_critical"],
        500,
      ),
    );
    assert.equal(updated.emitted, true);
    assert.equal(updated.phase, "updated");
    assert.equal(updated.incidentId, opened.incidentId);
    assert.equal(updated.sequence, 2);

    const recovered = await reconcileOperationalSignalIncident(
      root,
      observation(
        "healthy",
        "2026-09-18T10:03:00.000Z",
        [],
        0,
      ),
    );
    assert.equal(recovered.emitted, true);
    assert.equal(recovered.phase, "recovered");
    assert.equal(recovered.incidentId, opened.incidentId);
    assert.equal(recovered.sequence, 3);

    const signals = await pendingSignals(root);
    assert.deepEqual(
      signals.map((signal) => [signal.phase, signal.severity]),
      [
        ["opened", "warning"],
        ["updated", "critical"],
        ["recovered", "info"],
      ],
    );
    assert.equal(signals[0]?.details.readyBacklog, 50);
    assert.equal(signals[1]?.details.readyBacklog, 500);
    assert.equal(signals[2]?.details.readyBacklog, 0);
    assert.equal(
      signals.every(
        (signal) =>
          !JSON.stringify(signal).match(
            /studentId|tenantId|workspaceId|conversation|prompt/i,
          ),
      ),
      true,
    );

    const dirs = await ensureOperationalSpoolDirectories(root);
    assert.equal((await readdir(dirs.activeSignals)).length, 0);

    const deliveredIds: string[] = [];
    const delivery = await deliverOperationalAlerts({
      stateDirectory: root,
      webhookUrl: "http://127.0.0.1/ops-signal",
      now: new Date("2026-09-18T10:04:00.000Z"),
      limit: 10,
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        deliveredIds.push(headers.get("Idempotency-Key") ?? "");
        return new Response(null, { status: 204 });
      },
    });
    assert.equal(delivery.delivered, 3);
    assert.equal(new Set(deliveredIds).size, 3);
    assert.equal((await readdir(dirs.pending)).length, 0);
    const deliveredNames = await readdir(dirs.delivered);
    assert.equal(deliveredNames.length, 3);
    for (const name of deliveredNames) {
      const archived = JSON.parse(
        await readFile(path.join(dirs.delivered, name), "utf8"),
      ) as {
        schemaVersion: number;
        delivery: {
          attemptCount: number;
          attempts: Array<{
            attemptNumber: number;
            deliveryResult: string;
            attemptedAt: string;
          }>;
        };
      };
      assert.equal(archived.schemaVersion, 2);
      assert.equal(archived.delivery.attemptCount, 1);
      assert.deepEqual(
        archived.delivery.attempts.map((attempt) => [
          attempt.attemptNumber,
          attempt.deliveryResult,
        ]),
        [[1, "delivered"]],
      );
    }
  });

  it("turns database authority loss into a critical durable incident and deduplicates repeats", async () => {
    const root = await tempRoot();
    const first = await reconcileOperationalSignalIncident(
      root,
      observation(
        "authority_unavailable",
        "2026-09-18T11:00:00.000Z",
        ["mentor_profile_database_unavailable"],
        0,
      ),
    );
    const repeat = await reconcileOperationalSignalIncident(
      root,
      observation(
        "authority_unavailable",
        "2026-09-18T11:01:00.000Z",
        ["mentor_profile_database_unavailable"],
        0,
      ),
    );
    assert.equal(first.emitted, true);
    assert.equal(repeat.emitted, false);
    const [signal] = await pendingSignals(root);
    assert.equal(signal?.severity, "critical");
    assert.equal(signal?.phase, "opened");
    assert.deepEqual(signal?.reasonCodes, [
      "mentor_profile_database_unavailable",
    ]);
  });

  it("rejects a replay that reuses one signal identity with different evidence", async () => {
    const root = await tempRoot();
    const signal: OperationalSignalEvidence = {
      schemaVersion: 1,
      signalId:
        "mentor-profile-health:33333333-3333-4333-8333-333333333333:1",
      incidentId: "33333333-3333-4333-8333-333333333333",
      sequence: 1,
      source: "mentor-profile-health",
      sourceUnit: "tecpey-mentor-profile-health.service",
      hostName: "mentor-signal-test",
      phase: "opened",
      severity: "warning",
      occurredAt: "2026-09-18T12:00:00.000Z",
      fingerprint: "a".repeat(64),
      reasonCodes: ["ready_backlog_warning"],
      details: { readyBacklog: 50 },
    };
    await enqueueOperationalSignal(root, signal);
    await assert.rejects(
      enqueueOperationalSignal(root, {
        ...signal,
        details: { readyBacklog: 51 },
      }),
      /operational_spool_identity_conflict/,
    );
  });

  it("rejects sensitive or high-cardinality detail keys at runtime", async () => {
    const root = await tempRoot();
    const incidentId = "55555555-5555-4555-8555-555555555555";
    const base: OperationalSignalEvidence = {
      schemaVersion: 1,
      signalId: `mentor-profile-health:${incidentId}:1`,
      incidentId,
      sequence: 1,
      source: "mentor-profile-health",
      sourceUnit: "tecpey-mentor-profile-health.service",
      hostName: "mentor-signal-test",
      phase: "opened",
      severity: "critical",
      occurredAt: "2026-09-18T13:00:00.000Z",
      fingerprint: "b".repeat(64),
      reasonCodes: ["dead_letter_present"],
      details: {
        policyVersion: "2026-09-18.3",
        readyBacklog: 1,
      },
    };

    await enqueueOperationalSignal(root, base);
    for (const forbiddenKey of [
      "student_id",
      "tenantId",
      "workspace-id",
      "accountId",
      "prompt",
      "apiKey",
    ]) {
      await assert.rejects(
        enqueueOperationalSignal(root, {
          ...base,
          signalId: `mentor-profile-health:${incidentId}:2`,
          sequence: 2,
          details: { [forbiddenKey]: "redacted" },
        }),
        /operational_signal_detail_key_forbidden/,
      );
    }
  });

  it("uses deterministic capped jitter for delivery retries", () => {
    const identity =
      "mentor-profile-health:44444444-4444-4444-8444-444444444444:1";
    const first = operationalDeliveryRetryDelayMs(1, identity);
    assert.equal(first, operationalDeliveryRetryDelayMs(1, identity));
    assert.equal(first >= 12_000 && first <= 18_000, true);
    assert.equal(operationalDeliveryRetryDelayMs(100, identity) <= 3_600_000, true);
    assert.throws(
      () => operationalDeliveryRetryDelayMs(0, identity),
      /operational_retry_attempt_invalid/,
    );
  });
});
