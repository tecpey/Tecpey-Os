import { withDb } from "@/lib/db";
import type { HeaderCarrier, RequestTenantAssertion } from "./request-tenant-assertion";
import { resolveRequestTenantAssertion } from "./request-tenant-assertion";
import { resolveBoundTenantPrincipal, type TenantPrincipalContext } from "./tenant-principal-context";

type Candidate = { student_id: string; email_matches: boolean; phone_matches: boolean };
export type StudentSessionIdentity =
  | { status: "resolved"; studentId: string }
  | { status: "unlinked"; studentId: null }
  | { status: "conflict" | "unavailable"; studentId: null };

// Account ID must come from completed credential/2FA verification or a verified
// refresh subject. Do not accept an account ID or matching evidence from a form.
export const VERIFIED_STUDENT_CANDIDATES_SQL = `
  SELECT s.id::text AS student_id,
         (s.email = a.email) IS TRUE AS email_matches,
         (s.phone = a.phone_e164) IS TRUE AS phone_matches
    FROM academy_auth_accounts a
    JOIN academy_students s ON s.email = a.email OR s.phone = a.phone_e164
   WHERE a.id = $1
     AND a.phone_verified_at IS NOT NULL
     AND NULLIF(a.phone_e164, '') IS NOT NULL
     AND NULLIF(a.email, '') IS NOT NULL
   LIMIT 2`;

type Dependencies = {
  candidates: (accountId: string) => Promise<Candidate[] | null>;
  assertion: (request: HeaderCarrier, studentId: string) => Promise<RequestTenantAssertion>;
  binding: (studentId: string, assertion: RequestTenantAssertion) => Promise<TenantPrincipalContext>;
};

const dependencies: Dependencies = {
  candidates: async (accountId) => {
    const result = await withDb(async (client) =>
      (await client.query<Candidate>(VERIFIED_STUDENT_CANDIDATES_SQL, [accountId])).rows);
    return result.enabled ? result.value : null;
  },
  assertion: (request, studentId) => resolveRequestTenantAssertion({
    request, principalType: "student", principalId: studentId,
  }),
  binding: (studentId, assertion) => resolveBoundTenantPrincipal({
    principalType: "student", principalId: studentId,
    preferredTenantId: assertion.status === "asserted" ? assertion.tenantId : null,
    preferredWorkspaceId: assertion.status === "asserted" ? assertion.workspaceId : null,
    scopes: [], requestId: crypto.randomUUID(),
  }),
};

/** Read-only linking: no student creation, email-only merge or tenant admission. */
export async function resolveAcademyStudentSessionIdentity(
  request: HeaderCarrier,
  accountId: string,
  services: Dependencies = dependencies,
): Promise<StudentSessionIdentity> {
  try {
    if (!accountId.trim()) return { status: "unavailable", studentId: null };
    const rows = await services.candidates(accountId);
    if (rows === null) return { status: "unavailable", studentId: null };
    if (!rows.length) return { status: "unlinked", studentId: null };
    if (rows.length !== 1 || rows[0].email_matches !== true || rows[0].phone_matches !== true) {
      return { status: "conflict", studentId: null };
    }
    const studentId = rows[0].student_id;
    const assertion = await services.assertion(request, studentId);
    if (assertion.status === "foreign_host") return { status: "conflict", studentId: null };
    const binding = await services.binding(studentId, assertion);
    if (!binding.available) return {
      status: binding.reason === "binding_storage_unavailable" ? "unavailable" : "conflict",
      studentId: null,
    };
    if (binding.principalId !== studentId || binding.principalType !== "student") {
      return { status: "conflict", studentId: null };
    }
    return { status: "resolved", studentId };
  } catch {
    return { status: "unavailable", studentId: null };
  }
}
