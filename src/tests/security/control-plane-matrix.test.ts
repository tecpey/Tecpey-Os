import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAdminControlPlaneMatrix,
  type AdminControlPlaneModuleId,
} from "@/lib/admin-control-plane-matrix";
import type { FeatureFlag } from "@/lib/feature-flags";

const LAUNCH_SAFE_FLAGS: Record<FeatureFlag, boolean> = {
  "academy.enabled": true,
  "exchange.enabled": false,
  "social.enabled": false,
  "community.enabled": true,
  "mentor.enabled": true,
  "future.marketplace.enabled": false,
};

function moduleById(id: AdminControlPlaneModuleId) {
  const snapshot = resolveAdminControlPlaneMatrix({
    featureFlags: LAUNCH_SAFE_FLAGS,
    now: new Date("2026-08-14T12:00:00.000Z"),
  });
  const targetModule = snapshot.modules.find((item) => item.id === id);
  assert.ok(targetModule, `${id} module must exist`);
  return targetModule;
}

describe("admin control plane matrix", () => {
  it("keeps real-money exchange, custody and withdrawals launch-locked by default", () => {
    const snapshot = resolveAdminControlPlaneMatrix({
      featureFlags: LAUNCH_SAFE_FLAGS,
      now: new Date("2026-08-14T12:00:00.000Z"),
    });

    assert.equal(snapshot.generatedAt, "2026-08-14T12:00:00.000Z");
    assert.equal(snapshot.modules.length, snapshot.summary.totalModules);

    for (const id of ["real_exchange", "wallet_custody", "withdrawals_settlement"] as const) {
      const targetModule = snapshot.modules.find((item) => item.id === id);
      assert.ok(targetModule, `${id} module must exist`);
      assert.equal(targetModule.status, "launch_locked");
      assert.equal(targetModule.riskLevel, "critical");
      assert.equal(targetModule.stepUpRequired, true);
      assert.ok(targetModule.descriptionFa.includes("قفل") || targetModule.controls.some((control) => control.lockedReasonFa?.includes("قفل")));
    }
  });

  it("keeps every critical mutation behind admin permission and step-up", () => {
    const snapshot = resolveAdminControlPlaneMatrix({ featureFlags: LAUNCH_SAFE_FLAGS });

    const criticalModules = snapshot.modules.filter((module) => module.riskLevel === "critical");
    assert.ok(criticalModules.length >= 5);

    for (const targetModule of criticalModules) {
      assert.match(targetModule.requiredPermission, /^admin\.roles\./);
      assert.equal(targetModule.stepUpRequired, true, `${targetModule.id} must require step-up`);

      for (const control of targetModule.controls.filter((item) => item.requiredPermission.endsWith(".manage"))) {
        assert.equal(control.stepUpRequired, true, `${targetModule.id}/${control.id} must require step-up`);
      }
    }
  });

  it("makes locked or secret-required connections explainable", () => {
    const snapshot = resolveAdminControlPlaneMatrix({ featureFlags: LAUNCH_SAFE_FLAGS });

    const lockedConnections = snapshot.modules.flatMap((targetModule) =>
      targetModule.connections.filter((connection) => ["locked", "needs_secret"].includes(connection.status)),
    );
    assert.equal(lockedConnections.length, snapshot.summary.lockedConnections);
    assert.ok(lockedConnections.length > 0);

    for (const connection of lockedConnections) {
      assert.ok(connection.lockedReasonFa && connection.lockedReasonFa.length > 12, `${connection.id} needs a Persian locked reason`);
      assert.ok(connection.lockedReasonEn && connection.lockedReasonEn.length > 12, `${connection.id} needs an English locked reason`);
    }
  });

  it("surfaces OAuth provider control from the identity module", () => {
    const targetModule = moduleById("auth_identity");

    assert.equal(targetModule.adminRoute, "/command-center/auth-providers");
    assert.ok(targetModule.apiRoutes.includes("/api/command-center/auth-providers"));
    assert.ok(targetModule.controls.some((control) => control.id === "provider_enable_review"));
  });

  it("feature-locks future marketplace until its flag is explicitly enabled", () => {
    const targetModule = moduleById("future_marketplace");

    assert.equal(targetModule.status, "feature_locked");
    assert.deepEqual(targetModule.gatedBy, ["future.marketplace.enabled"]);
  });
});
