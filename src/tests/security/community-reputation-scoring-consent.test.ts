import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

describe("Community reputation scoring consent source boundary", () => {
  it("keeps scoring opt-in separate, explicit, accessible, and server-authoritative", async () => {
    const root = process.cwd();
    const [
      profileRoute,
      scoreRoute,
      consentAuthority,
      consentClient,
      consentControl,
      scoreAuthority,
      scorePanel,
      migration,
      plan,
      career,
      packageJson,
    ] = await Promise.all([
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
        path.join(root, "src/lib/community-reputation-scoring-consent-client.ts"),
        "utf8",
      ),
      readFile(
        path.join(
          root,
          "src/components/academy/community/ReputationScoringConsentControl.tsx",
        ),
        "utf8",
      ),
      readFile(
        path.join(root, "src/lib/community-journal-discipline-score-authority.ts"),
        "utf8",
      ),
      readFile(
        path.join(
          root,
          "src/components/academy/community/JournalDisciplineScorePanel.tsx",
        ),
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

    assert.match(consentClient, /exactKeys/);
    assert.match(consentClient, /community-reputation-scoring-consent-v1/);
    assert.match(consentClient, /credentials: "same-origin"/);
    assert.match(consentClient, /cache: "no-store"/);
    assert.match(consentClient, /"Idempotency-Key"/);
    assert.match(consentClient, /cryptoApi\.randomUUID/);
    assert.match(consentClient, /cryptoApi\.getRandomValues/);
    assert.match(consentClient, /revision_conflict/);
    assert.doesNotMatch(consentClient, /localStorage|sessionStorage|Math\.random/);

    assert.match(consentControl, /useLocale/);
    assert.match(consentControl, /COPY: Record<"fa" \| "en"/);
    assert.match(consentControl, /type="checkbox"/);
    assert.match(consentControl, /disabled={!acknowledged \|\| saving}/);
    assert.match(consentControl, /save\(false\)/);
    assert.match(consentControl, /role="status"/);
    assert.match(consentControl, /aria-live="polite"/);
    assert.match(consentControl, /Default off/);
    assert.match(consentControl, /پیش‌فرض خاموش/);
    assert.doesNotMatch(
      consentControl,
      /localStorage|sessionStorage|document\.cookie|Math\.random/,
    );

    assert.match(scoreAuthority, /isCommunityReputationScoringConsentEnabledTx/);
    assert.match(scoreAuthority, /consentRequired: true/);
    assert.match(scoreRoute, /journal_discipline_score_consent_required/);
    assert.match(scorePanel, /ReputationScoringConsentControl/);
    assert.match(scorePanel, /onConsentChanged/);
    assert.match(scorePanel, /useLocale/);
    assert.match(scorePanel, /const loadSequenceRef = useRef\(0\)/);
    assert.match(scorePanel, /const sequence = loadSequenceRef\.current \+ 1/);
    assert.match(scorePanel, /if \(sequence !== loadSequenceRef\.current\) return/);
    assert.match(scorePanel, /loadSequenceRef\.current \+= 1/);

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
