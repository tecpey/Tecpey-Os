import type { CanonicalSession } from "./auth-session";

type ArenaSession = Pick<CanonicalSession, "authorityDegraded" | "studentId" | "isAcademyUser">;

/** Identity-service failure is not evidence of logout or missing onboarding. */
export function resolveArenaSessionError(session: ArenaSession):
  | { code: "arena_session_unavailable"; status: 503 }
  | { code: "academy_login_required" | "academy_profile_required"; status: 401 }
  | null {
  if (session.authorityDegraded) return { code: "arena_session_unavailable", status: 503 };
  if (session.studentId) return null;
  return {
    code: session.isAcademyUser ? "academy_profile_required" : "academy_login_required",
    status: 401,
  };
}

/** Only an explicit profile decision may send a learner to onboarding. */
export function resolveArenaAccessGate(code: unknown, status: number): "profile" | "login" | "error" {
  if (status !== 401) return "error";
  return code === "academy_profile_required" ? "profile" : "login";
}
