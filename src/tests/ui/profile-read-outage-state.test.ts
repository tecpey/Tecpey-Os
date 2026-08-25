import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  resolveAcademyPostAuthPath,
  resolveAcademyProfileReadState,
  resolveSafeAcademyReturnPath,
} from "../../lib/academy-profile-read-state";

type TestProfile = { display_name?: string | null };

const okResponse = { ok: true } as Pick<Response, "ok">;
const failedResponse = { ok: false } as Pick<Response, "ok">;

describe("Academy profile client authority state", () => {
  it("keeps a 503 or network failure distinct from logout", () => {
    assert.deepEqual(
      resolveAcademyProfileReadState<TestProfile>(failedResponse, {
        error: "academy_profile_service_unavailable",
      }),
      {
        status: "unavailable",
        profile: null,
        error: "academy_profile_service_unavailable",
      },
    );
    assert.equal(
      resolveAcademyProfileReadState<TestProfile>(null, null).status,
      "unavailable",
    );
  });

  it("requires an explicit successful authority response before showing an auth gate", () => {
    assert.deepEqual(
      resolveAcademyProfileReadState<TestProfile>(okResponse, {
        authenticated: false,
        profile: null,
      }),
      { status: "unauthenticated", profile: null },
    );
    assert.equal(
      resolveAcademyProfileReadState<TestProfile>(okResponse, {
        authenticated: false,
      }).status,
      "unavailable",
    );
    assert.equal(
      resolveAcademyProfileReadState<TestProfile>(okResponse, null).status,
      "unavailable",
    );
  });

  it("opens onboarding only after an authenticated no-profile decision", () => {
    const noProfile = resolveAcademyProfileReadState<TestProfile>(okResponse, {
      authenticated: true,
      profile: null,
    });
    const completeProfile = resolveAcademyProfileReadState<TestProfile>(okResponse, {
      authenticated: true,
      profile: { display_name: "Learner" },
    });
    const unavailable = resolveAcademyProfileReadState<TestProfile>(
      failedResponse,
      null,
    );

    assert.equal(resolveAcademyPostAuthPath("fa", noProfile), "/academy/onboarding");
    assert.equal(resolveAcademyPostAuthPath("en", noProfile), "/en/academy/onboarding");
    assert.equal(resolveAcademyPostAuthPath("fa", completeProfile), "/academy/profile");
    assert.equal(resolveAcademyPostAuthPath("en", unavailable), "/en/academy/profile");
  });

  it("returns a completed profile only to a safe Academy destination", () => {
    const completeProfile = resolveAcademyProfileReadState<TestProfile>(okResponse, {
      authenticated: true,
      profile: { display_name: "Learner" },
    });
    const noProfile = resolveAcademyProfileReadState<TestProfile>(okResponse, {
      authenticated: true,
      profile: null,
    });
    const unavailable = resolveAcademyProfileReadState<TestProfile>(
      failedResponse,
      null,
    );

    assert.equal(
      resolveAcademyPostAuthPath(
        "fa",
        completeProfile,
        "/academy/certificates?tab=issued#credentials",
      ),
      "/academy/certificates?tab=issued#credentials",
    );
    assert.equal(
      resolveAcademyPostAuthPath(
        "en",
        completeProfile,
        "/en/academy/trading-arena",
      ),
      "/en/academy/trading-arena",
    );
    assert.equal(
      resolveAcademyPostAuthPath("fa", noProfile, "/academy/certificates"),
      "/academy/onboarding",
    );
    assert.equal(
      resolveAcademyPostAuthPath("fa", unavailable, "/academy/certificates"),
      "/academy/profile",
    );
  });

  it("rejects external, cross-locale and auth-loop return values", () => {
    assert.equal(
      resolveSafeAcademyReturnPath("fa", "https://evil.example/academy/profile"),
      null,
    );
    assert.equal(resolveSafeAcademyReturnPath("fa", "//evil.example/path"), null);
    assert.equal(resolveSafeAcademyReturnPath("fa", "javascript:alert(1)"), null);
    assert.equal(
      resolveSafeAcademyReturnPath("fa", "/en/academy/profile"),
      null,
    );
    assert.equal(
      resolveSafeAcademyReturnPath("fa", "/academy/login"),
      null,
    );
    assert.equal(
      resolveSafeAcademyReturnPath("en", "/en/academy/signup"),
      null,
    );
    assert.equal(
      resolveSafeAcademyReturnPath("fa", "/academy/profile"),
      "/academy/profile",
    );
  });

  it("wires the fail-closed state into login, onboarding and dashboard surfaces", async () => {
    const [auth, onboarding, dashboard] = await Promise.all([
      readFile(
        new URL("../../components/academy/AcademyAuthClient.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../components/academy/AcademyOnboardingClient.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../components/academy/AcademyStudentDashboardV2.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(
      auth,
      /resolveAcademyPostAuthPath\(locale, profileState, requestedPath\)/,
    );
    assert.match(
      auth,
      /ایمیل یا شماره موبایل معتبر وارد کن\./,
    );
    assert.match(onboarding, /state\.status === "unavailable"/);
    assert.match(onboarding, /<AcademyProfileUnavailableState/);
    assert.match(dashboard, /profileState\.status === "unavailable"/);
    assert.match(dashboard, /<AcademyProfileUnavailableState/);
    assert.doesNotMatch(dashboard, /setAuthenticated\(Boolean\(profileData/);
  });
});
