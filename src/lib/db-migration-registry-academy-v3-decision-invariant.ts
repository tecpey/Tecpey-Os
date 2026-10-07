import type { PoolClient } from "pg";
import type { MigrationRegistryEntry } from "./db-migration-registry";
import { CANONICAL_MIGRATION_CONTENT } from "./db-migration-content";
import { runAcademyV3DecisionInvariantMigrations } from "./db-migrate-academy-v3-decision-invariant";

/**
 * Staged Academy V3 decision-invariant registry definition.
 *
 * This module intentionally does not mutate DATABASE_MIGRATION_REGISTRY. It keeps
 * the step-104 contract reviewable while the canonical registry is updated
 * atomically in the final integration commit.
 */
export const ACADEMY_V3_DECISION_INVARIANT_MIGRATION_STEP = Object.freeze({
  sequence: 104,
  id: "migration-step-104",
  owner: "academy-platform",
  domain: "academy",
  migrations: CANONICAL_MIGRATION_CONTENT.academyV3DecisionInvariant,
  run: runAcademyV3DecisionInvariantMigrations as (client: PoolClient) => Promise<void>,
}) satisfies Pick<MigrationRegistryEntry, "sequence" | "id" | "owner" | "domain" | "migrations" | "run">;
