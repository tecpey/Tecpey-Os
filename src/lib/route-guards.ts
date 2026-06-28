/**
 * Unified route protection guards.
 *
 * Each guard returns null when the check passes, or a NextResponse error when it fails.
 *
 * Guard-return pattern in a route handler:
 *   const guard = requireRole(session, "student");
 *   if (guard) return guard;
 */

import type { NextResponse } from "next/server";
import type { CanonicalSession } from "./auth-session";
import type { Role } from "./platform-types";
import type { FeatureFlag } from "./feature-flags";
import { isFeatureEnabled } from "./feature-flags";
import { permission } from "./permission";
import { apiError } from "./api-validation";

// ── Tenant guard ──────────────────────────────────────────────────────────────

/**
 * Verifies the request operates within a valid tenant context.
 * In Phase 24 TecPey runs as a single-tenant platform; this guard is a
 * forward-compatible hook for multi-tenant enforcement in a future phase.
 * Returns null for any authenticated session; 401 for fully unauthenticated guests.
 */
export function requireTenant(session: CanonicalSession): NextResponse | null {
  if (session.isAcademyUser || Boolean(session.studentId) || Boolean(session.userId)) {
    return null;
  }
  return apiError("tenant_required", 401);
}

// ── Role guard ────────────────────────────────────────────────────────────────

/**
 * Returns null if the session carries the given role; returns a 403 response otherwise.
 */
export function requireRole(session: CanonicalSession, role: Role): NextResponse | null {
  const perm = permission(session);
  if (perm.hasRole(role)) return null;
  return apiError("forbidden", 403);
}

// ── Permission guard ──────────────────────────────────────────────────────────

/**
 * Returns null if the session may perform the action; returns a 403 response otherwise.
 * Actions follow the "product.operation" namespace convention (e.g. "academy.submit").
 */
export function requirePermission(session: CanonicalSession, action: string): NextResponse | null {
  const perm = permission(session);
  return perm.require(action);
}

// ── Feature flag guard ────────────────────────────────────────────────────────

/**
 * Returns null if the feature flag is enabled; returns a 403 "feature_disabled" response if not.
 * Use this to gate entire route handlers behind a feature flag.
 */
export function requireFeature(flag: FeatureFlag): NextResponse | null {
  if (isFeatureEnabled(flag)) return null;
  return apiError("feature_disabled", 403);
}
