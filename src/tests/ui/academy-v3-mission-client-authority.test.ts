import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const componentUrl = new URL("../../components/academy/v3/AcademyV3MissionPreview.tsx", import.meta.url);

describe("Academy V3 mission client authority", () => {
  it("never grades a decision from the bundled mission registry", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.doesNotMatch(source, /choiceId\s*===\s*mission\.scenario\.correctChoiceId/);
    assert.doesNotMatch(source, /correctChoiceId/);
    assert.match(source, /const correct = decision\?\.correct === true/);
  });

  it("issues a server-owned attempt before sending the decision command", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.match(source, /fetch\("\/api\/academy-v3\/missions"/);
    assert.match(source, /\{ action: "issue", locale, missionId: mission\.id \}/);
    assert.match(source, /setAttemptId\(payload\.attempt\.attemptId\)/);
    assert.match(source, /\{ action: "decide", attemptId: activeAttemptId, choiceId \}/);
    assert.doesNotMatch(source, /correct:\s*(?:true|false|correct|selected|choiceId)/);
    assert.doesNotMatch(source, /(?:set|grant|award|derive|calculate)[A-Za-z]*(?:Mastery|mastery)/);
  });

  it("keeps stable idempotency keys across ambiguous retries and prevents double submit", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.match(source, /issueKeyRef\.current \?\? idempotencyKey\("issue"\)/);
    assert.match(source, /existing\?\.choiceId === choiceId \? existing\.key : idempotencyKey\("decision"\)/);
    assert.match(source, /phase === "issuing" \|\| phase === "submitting"/);
    assert.match(source, /disabled=\{!choiceId \|\| phase === "issuing" \|\| phase === "submitting"\}/);
  });

  it("fails closed on network or authority errors instead of showing local feedback", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.match(source, /if \(!response\.ok \|\| !payload\?\.data\) throw new Error/);
    assert.match(source, /catch \{/);
    assert.match(source, /setPhase\("error"\)/);
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="polite"/);
  });
});
