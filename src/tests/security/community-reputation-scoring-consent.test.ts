import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

describe("Community reputation scoring consent source boundary", () => {
  it("keeps scoring opt-in separate and gates Journal Discipline computation", async () => {
    const root = process.cwd();
    const [profileRoute, scoreRoute, consentAuthority, scoreAuthority, migration, plan, career, packageJson] =
      await Promise.all([
        readFile(path.join(root, "src/app/api/community/profile/route.ts"), "utf8"),
        readFile(
          path.join(root, "src/app/api/community/journal-discipline-score/route.ts"),
          "utf8",
        ),
        readFile(
          path.join(root, "src/lib/community-reputation-scoring-consent-authority.ts"),
          "utf8",
        ),
        readFile(
          path.join(root, "src/lib/community-journal-discipline-score-authority.ts"),
          "utf8",
        ),
        readFile(
          path.join(root, "src/lib/db-migrate-community-reputation-scoring-consent.ts"),
          "utf8",
        ),
        readFile(path.join(root, "src/lib/db-migration-plan.ts"), "utf8"),
        readFile(path.join(root, "src/lib/community-career.ts"), "utf8"),
        readFile(path.join(root, "package.json"), "utf8"),
      ]);

    assert.match(profileRoute, /view === "reputation-scoring-consent"/);
    assert.match(profileRoute, /parseReputationScoringConsentPatch/);
    assert.match(profileRoute, /community-reputation-scoring-consent-write/);
    assert.match(profileRoute, /reputationScoringEnabled/);

    assert.match(consentAuthority, /COMMUNITY_REPUTATION_SCORING_CONSENT_POLICY/);
    assert.match(consentAuthority, /isCommunityReputationScoringConsentEnabledTx/);
    assert.match(consentAuthority, /writeSensitiveMutationAuditTx/);
    assert.doesNotMatch(consentAuthority, /\bscoreBps\b|\brank\b|rewardEligibility/);

    assert.match(scoreAuthority, /isCommunityReputationScoringConsentEnabledTx/);
    assert.match(scoreAuthority, /consentRequired: true/);
    assert.match(scoreRoute, /journal_discipline_score_consent_required/);

    assert.match(migration, /enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(migration, /community-reputation-scoring-consent-v1/);
    assert.match(migration, /tecpey_create_default_reputation_scoring_consent/);
    assert.match(plan, /runCommunityReputationScoringConsentMigrations/);

    assert.match(career, /COMMUNITY_CAREER_AUTHORITY = "preview-only"/);
    assert.doesNotMatch(
      career,
      /community-reputation-scoring-consent-authority|community-reputation-evidence-authority/,
    );

    assert.match(
      packageJson,
      /community-reputation-scoring-consent-postgres\.integration\.ts/,
    );
  });
});
