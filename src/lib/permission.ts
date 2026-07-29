/**
 * Unified permission layer.
 *
 * Creates a PermissionContext from a CanonicalSession and exposes:
 *   perm.can(action)       — boolean check
 *   perm.require(action)   — returns apiError 403 or null (for guard returns)
 *   perm.hasRole(role)     — role membership check
 *   perm.hasFeature(flag)  — feature flag check
 *
 * Usage in a route handler:
 *   const perm = permission(await getCanonicalSession(req));
 *   const guard = perm.require("academy.submit");
 *   if (guard) return guard;
 */

import type { CanonicalSession } from "./auth-session";
import type { Role } from "./platform-types";
import { isFeatureEnabled, type FeatureFlag } from "./feature-flags";
import { apiError } from "./api-validation";
import type { NextResponse } from "next/server";

// ── Role → permission mapping ─────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ["*"],
  moderator: ["social.*", "academy.view", "academy.moderate", "mentor.chat"],
  teacher: ["academy.*", "mentor.*", "social.view"],
  student: ["academy.view", "academy.submit", "mentor.chat", "social.view", "social.post"],
  trader: ["exchange.view", "exchange.trade", "academy.view"],
  support: ["admin.view", "academy.view", "social.view"],
  guest: ["academy.view", "exchange.view", "social.view"],
};

// ── Role resolution ───────────────────────────────────────────────────────────

/**
 * Derives the set of platform roles from a canonical session.
 * Multiple roles may apply simultaneously (e.g. an admin who is also a student).
 */
export function resolveRoles(session: CanonicalSession): Role[] {
  const roles: Role[] = [];
  if (session.isAdmin) roles.push("admin");
  if (session.userId) roles.push("trader");
  if (session.isAcademyUser) roles.push("teacher");
  if (session.studentId) roles.push("student");
  if (roles.length === 0) roles.push("guest");
  return roles;
}

// ── Permission checking ───────────────────────────────────────────────────────

function matchesGrant(granted: string, required: string): boolean {
  if (granted === "*") return true;
  if (granted === required) return true;
  const [product] = required.split(".");
  if (granted === `${product}.*`) return true;
  return false;
}

function checkPermission(roles: Role[], action: string): boolean {
  for (const role of roles) {
    const grants = ROLE_PERMISSIONS[role] ?? [];
    if (grants.some((g) => matchesGrant(g, action))) return true;
  }
  return false;
}

// ── Permission context ────────────────────────────────────────────────────────

export type PermissionContext = {
  /** Returns true if the session may perform the given namespaced action. */
  can(action: string): boolean;
  /**
   * Returns null when access is granted, or an apiError 403 response when denied.
   * Designed for guard-return pattern: `const g = perm.require("x"); if (g) return g;`
   */
  require(action: string): NextResponse | null;
  /** Returns true if the session carries the given role. */
  hasRole(role: Role): boolean;
  /** Returns true if the named feature flag is enabled. */
  hasFeature(flag: FeatureFlag): boolean;
  /** The resolved roles for this session. */
  readonly roles: Role[];
};

/**
 * Creates a PermissionContext bound to the given canonical session.
 */
export function permission(session: CanonicalSession): PermissionContext {
  const roles = resolveRoles(session);

  return {
    can(action: string): boolean {
      return checkPermission(roles, action);
    },
    require(action: string): NextResponse | null {
      if (checkPermission(roles, action)) return null;
      return apiError("forbidden", 403);
    },
    hasRole(role: Role): boolean {
      return roles.includes(role);
    },
    hasFeature(flag: FeatureFlag): boolean {
      return isFeatureEnabled(flag);
    },
    get roles() {
      return roles;
    },
  };
}
