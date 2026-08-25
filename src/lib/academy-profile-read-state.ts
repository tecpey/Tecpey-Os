export type AcademyProfileLocale = "fa" | "en";

export type AcademyProfileEnvelope<TProfile> = {
  authenticated?: unknown;
  profile?: TProfile | null;
  error?: unknown;
};

export type AcademyProfileReadState<TProfile> =
  | {
      status: "authenticated";
      profile: TProfile | null;
    }
  | {
      status: "unauthenticated";
      profile: null;
    }
  | {
      status: "unavailable";
      profile: null;
      error: string;
    };

const PROFILE_UNAVAILABLE = "academy_profile_service_unavailable";

function isProfileValue<TProfile>(value: unknown): value is TProfile | null {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

/**
 * Converts the profile endpoint into an explicit client state. A missing,
 * malformed or non-2xx response is an authority outage, never evidence that a
 * valid user signed out or needs to recreate their profile.
 */
export function resolveAcademyProfileReadState<TProfile>(
  response: Pick<Response, "ok"> | null,
  payload: AcademyProfileEnvelope<TProfile> | null,
): AcademyProfileReadState<TProfile> {
  if (!response?.ok || !payload) {
    return {
      status: "unavailable",
      profile: null,
      error:
        typeof payload?.error === "string" && payload.error
          ? payload.error
          : PROFILE_UNAVAILABLE,
    };
  }

  if (payload.authenticated === false && payload.profile === null) {
    return { status: "unauthenticated", profile: null };
  }

  if (payload.authenticated === true && isProfileValue<TProfile>(payload.profile)) {
    return { status: "authenticated", profile: payload.profile };
  }

  return {
    status: "unavailable",
    profile: null,
    error: PROFILE_UNAVAILABLE,
  };
}

/**
 * After a successful login, onboarding is safe only when the profile authority
 * explicitly confirms an authenticated account with no completed profile.
 */
export function resolveAcademyPostAuthPath<TProfile extends { display_name?: string | null }>(
  locale: AcademyProfileLocale,
  state: AcademyProfileReadState<TProfile>,
): string {
  const base = locale === "en" ? "/en/academy" : "/academy";
  if (state.status === "authenticated" && !state.profile?.display_name) {
    return `${base}/onboarding`;
  }
  return `${base}/profile`;
}
