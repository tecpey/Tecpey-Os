import { ACADEMY_V3_DECISION_INVARIANT_SQL } from "./db-migrate-academy-v3-decision-invariant";
import { canonicalMigrationChecksum, type CanonicalMigrationContent } from "./db-migration-content";

/** Reviewable canonical contract for migration 0120. */
export const ACADEMY_V3_DECISION_INVARIANT_CANONICAL_MIGRATION: CanonicalMigrationContent = Object.freeze({
  identity: "0120_academy_v3_decision_invariant.sql",
  content: ACADEMY_V3_DECISION_INVARIANT_SQL,
  checksum: canonicalMigrationChecksum(ACADEMY_V3_DECISION_INVARIANT_SQL),
  acceptsHistoricalChecksumPrefix: false,
  compatibleHistoricalChecksums: Object.freeze([]),
});
