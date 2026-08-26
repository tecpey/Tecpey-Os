import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSystemdEnvironmentFile } from "../../lib/ops/systemd-environment-file";

describe("systemd EnvironmentFile parser", () => {
  it("preserves legitimate whitespace without exposing a shell evaluator", () => {
    const parsed = parseSystemdEnvironmentFile([
      "# governed runtime values",
      "LIMOO_SMS_API_KEY=key with internal spaces",
      "LIMOO_SMS_PATTERN_ID=42",
      "LIMOO_SMS_OTP_COPY='تک‌پی؛ رمز ورود شما: {0}'",
      String.raw`ESCAPED=value\ with\ spaces`,
      String.raw`DOUBLE="quoted \"value\" and \\ slash"`,
      "",
    ].join("\n"));

    assert.equal(parsed.get("LIMOO_SMS_API_KEY"), "key with internal spaces");
    assert.equal(parsed.get("LIMOO_SMS_PATTERN_ID"), "42");
    assert.equal(parsed.get("LIMOO_SMS_OTP_COPY"), "تک‌پی؛ رمز ورود شما: {0}");
    assert.equal(parsed.get("ESCAPED"), "value with spaces");
    assert.equal(parsed.get("DOUBLE"), 'quoted "value" and \\ slash');
  });

  it("rejects duplicate, malformed, unterminated and NUL-bearing input", () => {
    assert.throws(
      () => parseSystemdEnvironmentFile("KEY=first\nKEY=second\n"),
      /systemd_environment_file_key_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("lower=value\n"),
      /systemd_environment_file_key_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile('KEY="unterminated\n'),
      /systemd_environment_file_quote_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("KEY=bad\0value\n"),
      /systemd_environment_file_nul_forbidden/,
    );
  });
});
