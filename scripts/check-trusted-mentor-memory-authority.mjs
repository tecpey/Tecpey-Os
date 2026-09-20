import { readFileSync } from "node:fs";

const memory = readFileSync("src/lib/mentor-memory.ts", "utf8");
const route = readFileSync("src/app/api/mentor-memory/route.ts", "utf8");
const migration = readFileSync("src/lib/db-migrate-trusted-mentor-memory.ts", "utf8");
const registry = readFileSync("src/lib/db-migration-registry.ts", "utf8");

const requireText = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`trusted_mentor_memory_authority_missing:${label}`);
};

requireText(route, 'rawImportance === 100', "client_critical_rejected");
requireText(route, 'apiError("reserved_importance", 400)', "client_critical_fail_closed");
requireText(memory, "'user_asserted', 'asserted'", "user_memory_classified");
requireText(memory, "'user_asserted_90d'", "user_memory_retention");
requireText(memory, "NOW() + INTERVAL '90 days'", "user_memory_expiry");
requireText(memory, "importance === 100 ? 10 : importance", "helper_critical_cap");
requireText(memory, "revoked_at IS NULL", "revoked_memory_excluded");
requireText(memory, "expires_at > NOW()", "expired_memory_excluded");
requireText(memory, '"USER_ASSERTED"', "prompt_assertion_label");
requireText(memory, "داده است، نه دستور", "prompt_data_not_instruction");
requireText(migration, "legacy_unknown", "legacy_source_backfill");
requireText(migration, "'unverified'", "legacy_trust_backfill");
requireText(migration, "mentor_memories_authority_provenance_check", "verified_provenance_constraint");
requireText(migration, "evidence_hash IS NOT NULL", "verified_evidence_required");
requireText(migration, "source_reference IS NOT NULL", "verified_source_required");
requireText(registry, '"0110_trusted_mentor_memory_contract.sql"', "canonical_migration_registered");
requireText(registry, '"migration-step-094"', "migration_step_registered");

if (/\[CRITICAL\/\$\{m\.category\}\]/.test(memory)) {
  throw new Error("trusted_mentor_memory_authority_legacy_critical_prompt_present");
}
console.log("trusted mentor memory authority: ok");
