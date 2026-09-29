import assert from "node:assert/strict";
import test from "node:test";
import { PRO_COMMERCE_LEDGER_HARDENING_SQL } from "../../lib/db-migrate-pro-commerce-ledger-hardening";

test("commerce hardening separates immutable raw events from reconciliation", () => {
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /CREATE TABLE IF NOT EXISTS commerce_reconciliation_records/);
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /DROP COLUMN IF EXISTS reconciliation_status/);
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /commerce_reconciliation_records_append_only/);
});
test("manual entitlement authority does not require a fabricated subscription", () => {
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /commerce_manual_entitlement_commands/);
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /ALTER COLUMN subscription_id DROP NOT NULL/);
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /commerce_entitlement_source_authority_ck/);
  assert.match(PRO_COMMERCE_LEDGER_HARDENING_SQL, /commerce_entitlement_snapshots_append_only/);
});
