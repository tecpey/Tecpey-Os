import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoolClient, QueryResult } from "pg";
import {
  C_LEVEL_CONTROL_POLICY_VERSION,
  cLevelApprovalResourceId,
  requestCLevelApprovalTx,
  requireCLevelApprovalTx,
} from "../../lib/c-level-control-authority";

function result<T extends Record<string, unknown>>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

describe("C-level control authority", () => {
  it("records sensitive approval requests with tenant, resource and policy evidence", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return result([{
          id: "33333333-3333-4333-8333-333333333333",
          expires_at: "2026-08-22T00:00:00.000Z",
        }]);
      },
    } as unknown as PoolClient;

    const requested = await requestCLevelApprovalTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      action: "academy_mastery.publish",
      resourceType: "academy_mastery_season_generation_draft",
      resourceId: "22222222-2222-4222-8222-222222222222",
      requestedByAdminId: "11111111-1111-4111-8111-111111111111",
      reason: "Request C-level control approval for publishing a governed mastery season.",
      payload: { draftPolicyVersion: "academy-mastery-season" },
    });

    assert.equal(requested.approvalRequestId, "33333333-3333-4333-8333-333333333333");
    const insert = calls[0];
    assert.match(insert.sql, /INSERT INTO admin_approval_requests/);
    assert.equal(insert.values?.[0], "academy_mastery.publish");
    assert.equal(insert.values?.[2], "tenant-a/workspace-a/22222222-2222-4222-8222-222222222222");
    const payload = JSON.parse(String(insert.values?.[3]));
    assert.equal(payload.tenantId, "tenant-a");
    assert.equal(payload.workspaceId, "workspace-a");
    assert.equal(payload.controlPolicyVersion, C_LEVEL_CONTROL_POLICY_VERSION);
  });

  it("accepts only scoped approved requests reviewed by an allowed C-level/compliance role", async () => {
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        assert.match(sql, /FROM admin_approval_requests request/);
        assert.deepEqual(values, [
          "33333333-3333-4333-8333-333333333333",
          "arena_cash_reward.execute",
          "academy_arena_cash_reward",
          "tenant-a/workspace-a/snapshot-2026-08",
          "tenant-a",
          "workspace-a",
          C_LEVEL_CONTROL_POLICY_VERSION,
        ]);
        return result([{
          id: values?.[0],
          action: values?.[1],
          resource_type: values?.[2],
          resource_id: values?.[3],
          payload: {
            tenantId: "tenant-a",
            workspaceId: "workspace-a",
            controlledAction: "arena_cash_reward.execute",
            resourceType: "academy_arena_cash_reward",
            resourceId: "snapshot-2026-08",
            controlPolicyVersion: C_LEVEL_CONTROL_POLICY_VERSION,
          },
          requested_by: "11111111-1111-4111-8111-111111111111",
          reviewed_by: "22222222-2222-4222-8222-222222222222",
          reviewed_roles: ["treasury_approver"],
          reviewed_at: "2026-08-15T10:00:00.000Z",
          expires_at: "2026-08-22T10:00:00.000Z",
        }]);
      },
    } as unknown as PoolClient;

    const approval = await requireCLevelApprovalTx(client, {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      action: "arena_cash_reward.execute",
      resourceType: "academy_arena_cash_reward",
      resourceId: "snapshot-2026-08",
      approvalRequestId: "33333333-3333-4333-8333-333333333333",
    });

    assert.equal(approval.policyVersion, C_LEVEL_CONTROL_POLICY_VERSION);
    assert.deepEqual(approval.reviewedByRoles, ["treasury_approver"]);
  });

  it("rejects approved-looking requests when the reviewer role is not authorized", async () => {
    const client = {
      query: async () => result([{
        id: "33333333-3333-4333-8333-333333333333",
        action: "academy_credential.lifecycle_sensitive",
        resource_type: "academy_credential",
        resource_id: cLevelApprovalResourceId({
          tenantId: "tenant-a",
          workspaceId: "workspace-a",
          resourceId: "credential-1",
        }),
        payload: {
          tenantId: "tenant-a",
          workspaceId: "workspace-a",
          controlledAction: "academy_credential.lifecycle_sensitive",
          resourceType: "academy_credential",
          resourceId: "credential-1",
          controlPolicyVersion: C_LEVEL_CONTROL_POLICY_VERSION,
        },
        requested_by: "11111111-1111-4111-8111-111111111111",
        reviewed_by: "22222222-2222-4222-8222-222222222222",
        reviewed_roles: ["support_agent"],
        reviewed_at: "2026-08-15T10:00:00.000Z",
        expires_at: "2026-08-22T10:00:00.000Z",
      }]),
    } as unknown as PoolClient;

    await assert.rejects(
      () => requireCLevelApprovalTx(client, {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        action: "academy_credential.lifecycle_sensitive",
        resourceType: "academy_credential",
        resourceId: "credential-1",
        approvalRequestId: "33333333-3333-4333-8333-333333333333",
      }),
      /c_level_reviewer_role_required/,
    );
  });
});
