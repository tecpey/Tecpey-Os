import { access, readFile } from "node:fs/promises";

const failures = [];
const source = async (path) => readFile(path, "utf8");

const route = await source("src/app/api/ai-mentor/route.ts");
for (const [label, pattern] of [
  ["strict session", /getCanonicalSession\(request, \{ strictRevocation: true \}\)/],
  ["bounded body", /readBoundedJsonRequest<MentorRequest>/],
  ["trust inspection", /inspectMentorUserText\(rawQuestion\)/],
  ["secret incident response", /secretIncidentResponse\(locale\)/],
  ["typed egress preparation", /prepareMentorEgress\(/],
  ["evidence admission", /phase: "admitted"/],
  ["provider authority", /callMentorProvider\(/],
  ["output safety", /inspectMentorOutput\(provider\.answer\)/],
  ["atomic conversation pair", /persistMentorConversationPair\(/],
  ["explicit memory mode", /memoryMode:/],
  ["client history ignored evidence", /client_history_ignored/],
]) {
  if (!pattern.test(route)) failures.push(`AI Mentor route: missing ${label}`);
}
if (/body\.(?:history|progress|behavioralContext)\s*\.(?:map|slice|filter|join)/.test(route)) {
  failures.push("AI Mentor route: client-authored context is used as prompt authority");
}
if (/buildContextPrompt|saveMentorConversation|getOrCreateMentorProfile/.test(route)) {
  failures.push("AI Mentor route: legacy non-transactional prompt/memory authority remains");
}
if (/fetch\(\s*["']https:\/\/api\.openai\.com/.test(route)) {
  failures.push("AI Mentor route: provider is called outside the provider boundary");
}
if (/debug:\s*errorText|response\.text\(\)[\s\S]*apiOk/.test(route)) {
  failures.push("AI Mentor route: raw provider errors may reach the client");
}
const admissionIndex = route.indexOf('phase: "admitted"');
const providerIndex = route.indexOf("callMentorProvider({");
if (admissionIndex < 0 || providerIndex < 0 || admissionIndex > providerIndex) {
  failures.push("AI Mentor route: immutable egress admission must precede provider call");
}

const trust = await source("src/lib/ai/mentor-trust-boundary.ts");
for (const [label, pattern] of [
  ["Unicode normalization", /normalize\("NFKC"\)/],
  ["zero-width removal", /ZERO_WIDTH/],
  ["base64 inspection", /Buffer\.from\(encoded, "base64"\)/],
  ["seed phrase detection", /seed_phrase/],
  ["private key detection", /private_key/],
  ["OTP detection", /"otp"/],
  ["API key detection", /"api_key"/],
  ["PII minimization", /\[email-redacted\]/],
  ["prompt injection signals", /ignore_policy/],
  ["typed untrusted input", /userQuestionIsUntrustedData/],
  ["behavioral consent gate", /behavioralPersonalizationEnabled/],
  ["output signal rejection", /direct_signal/],
]) {
  if (!pattern.test(trust)) failures.push(`trust boundary: missing ${label}`);
}

const provider = await source("src/lib/ai/mentor-provider.ts");
for (const [label, pattern] of [
  ["hard timeout", /AI mentor provider timeout/],
  ["request abort forwarding", /requestSignal\.addEventListener\("abort"/],
  ["bounded retry", /models\.length > 1/],
  ["circuit breaker", /FAILURE_THRESHOLD/],
  ["response size limit", /MAX_RESPONSE_CHARS/],
  ["output token cap", /max_output_tokens/],
]) {
  if (!pattern.test(provider)) failures.push(`provider boundary: missing ${label}`);
}

const store = await source("src/lib/ai/mentor-trust-store.ts");
for (const [label, pattern] of [
  ["default-off personalization", /behavioralPersonalizationEnabled: false/],
  ["real exchange deny", /realExchangeSignalsEnabled: false/],
  ["append evidence", /INSERT INTO ai_mentor_request_evidence/],
  ["transactional conversation pair", /INSERT INTO mentor_conversations[\s\S]*'user'[\s\S]*'assistant'/],
  ["bounded history", /LIMIT 200/],
]) {
  if (!pattern.test(store)) failures.push(`trust store: missing ${label}`);
}

const migration = await source("src/lib/db-migrate-ai-mentor-trust.ts");
for (const [label, pattern] of [
  ["consent table", /CREATE TABLE IF NOT EXISTS mentor_ai_preferences/],
  ["evidence table", /CREATE TABLE IF NOT EXISTS ai_mentor_request_evidence/],
  ["append-only update trigger", /ai_mentor_evidence_no_update/],
  ["append-only delete trigger", /ai_mentor_evidence_no_delete/],
  ["forbidden metadata keys", /tecpey_sensitive_audit_has_forbidden_key/],
  ["conversation request ID", /ADD COLUMN IF NOT EXISTS request_id UUID/],
]) {
  if (!pattern.test(migration)) failures.push(`mentor trust migration: missing ${label}`);
}

const migrationPlan = await source("src/lib/db-migration-plan.ts");
if (!/runAiMentorTrustMigrations/.test(migrationPlan)) {
  failures.push("migration plan: AI Mentor trust migration is not governed");
}

const preferences = await source("src/app/api/mentor-preferences/route.ts");
for (const [label, pattern] of [
  ["strict session", /strictRevocation: true/],
  ["CSRF", /verifyCsrfOrigin/],
  ["bounded body", /readBoundedJsonRequest\(req, \{ maxBytes: 2_048 \}\)/],
  ["audit", /mentor_ai_preferences_changed/],
  ["no-store", /Cache-Control", "private, no-store/],
]) {
  if (!pattern.test(preferences)) failures.push(`mentor preferences: missing ${label}`);
}
if (/realExchangeSignalsEnabled:\s*true/.test(preferences)) {
  failures.push("mentor preferences: real exchange signals may not be enabled in this containment phase");
}

const alias = await source("src/app/api/ai-mentor-v2/route.ts");
if (!/POST as canonicalPost/.test(alias) || !/return canonicalPost\(req\)/.test(alias)) {
  failures.push("AI Mentor V2 must delegate to the canonical trust boundary");
}

const forbiddenRecoveryWorkflow =
  ".github/workflows/ai-mentor-trust-source-snapshot-once.yml";
try {
  await access(forbiddenRecoveryWorkflow);
  failures.push(
    "CI governance: self-modifying AI Mentor recovery workflow must not remain in the repository",
  );
} catch {
  // Expected: recovery workflows are temporary and must remove themselves.
}

const packageJson = JSON.parse(await source("package.json"));
const scripts = packageJson.scripts ?? {};
if (!scripts["ai:trust:check"]) failures.push("package: ai:trust:check is missing");
if (!scripts["test:ai-mentor-trust"]) failures.push("package: test:ai-mentor-trust is missing");
if (!scripts["ai:redteam:check"]) failures.push("package: ai:redteam:check is missing");
if (
  scripts["ai:redteam:check"] &&
  (!scripts["ai:redteam:check"].includes("npm run ai:trust:check") ||
    !scripts["ai:redteam:check"].includes("npm run test:ai-mentor-trust"))
) {
  failures.push("package: ai:redteam:check must enforce both source guard and focused tests");
}
if (!scripts["release:check"]?.includes("npm run ai:redteam:check")) {
  failures.push("package: release:check does not enforce the AI Mentor red-team gate");
}

if (failures.length) {
  console.error("AI Mentor trust boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("AI Mentor trust boundary check passed.");
