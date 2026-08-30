import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mentorExternalProviderAuthorized,
  type MentorAiPreferenceLoad,
  type MentorAiPreferences,
} from "../../lib/ai/mentor-trust-store";

const preferences = (
  externalProviderEnabled: boolean,
): MentorAiPreferences => ({
  externalProviderEnabled,
  behavioralPersonalizationEnabled: false,
  realExchangeSignalsEnabled: false,
  consentVersion: "test",
  consentedAt: null,
});

describe("AI Mentor preference egress gate", () => {
  it("fails closed when the preference authority is absent or unavailable", () => {
    const unavailable: MentorAiPreferenceLoad = {
      available: false,
      preferences: null,
    };

    assert.equal(mentorExternalProviderAuthorized(null), false);
    assert.equal(mentorExternalProviderAuthorized(unavailable), false);
  });

  it("requires an available authority and an explicit enabled preference", () => {
    assert.equal(
      mentorExternalProviderAuthorized({
        available: true,
        preferences: preferences(false),
      }),
      false,
    );
    assert.equal(
      mentorExternalProviderAuthorized({
        available: true,
        preferences: preferences(true),
      }),
      true,
    );
  });
});
