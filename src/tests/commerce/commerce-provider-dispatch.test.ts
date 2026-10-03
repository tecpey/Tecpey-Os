import assert from "node:assert/strict";
import test from "node:test";
import { CommerceProviderDispatchError } from "../../lib/commerce/commerce-provider-dispatch";

test("provider dispatch errors expose bounded authority reason codes", () => {
  for (const code of ["operation_conflict", "operation_in_progress", "provider_outcome_unknown"] as const) {
    const error = new CommerceProviderDispatchError(code);
    assert.equal(error.message, code);
    assert.equal(error.code, code);
    assert.equal(error.name, "CommerceProviderDispatchError");
  }
});
