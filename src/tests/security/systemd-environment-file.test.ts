import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSystemdEnvironmentFile } from "../../lib/ops/systemd-environment-file";

describe("systemd EnvironmentFile parser", () => {
  it("matches systemd assignment, override and unquoted escape semantics", () => {
    const parsed = parseSystemdEnvironmentFile([
      "# governed runtime values",
      "; another comment",
      "a line without an assignment is ignored",
      "lower_case=value",
      "_PRIVATE=allowed",
      "DUPLICATE=first",
      "DUPLICATE=second",
      "LIMOO_SMS_API_KEY=key with internal spaces   ",
      "LIMOO_SMS_PATTERN_ID=42",
      String.raw`ESCAPED=value\ with\ spaces`,
      String.raw`ESCAPED_TRAILING=value\ `,
      String.raw`UNQUOTED_QUOTES=quotes'and"double`,
      "EQUALS=https://example.test/path?a=b",
      "CONTINUED=left\\",
      "  right",
      "",
    ].join("\n"));

    assert.equal(parsed.get("lower_case"), "value");
    assert.equal(parsed.get("_PRIVATE"), "allowed");
    assert.equal(parsed.get("DUPLICATE"), "second");
    assert.equal(parsed.get("LIMOO_SMS_API_KEY"), "key with internal spaces");
    assert.equal(parsed.get("LIMOO_SMS_PATTERN_ID"), "42");
    assert.equal(parsed.get("ESCAPED"), "value with spaces");
    assert.equal(parsed.get("ESCAPED_TRAILING"), "value ");
    assert.equal(parsed.get("UNQUOTED_QUOTES"), `quotes'and"double`);
    assert.equal(parsed.get("EQUALS"), "https://example.test/path?a=b");
    assert.equal(parsed.get("CONTINUED"), "left  right");
  });

  it("supports single- and double-quoted multiline values", () => {
    const parsed = parseSystemdEnvironmentFile([
      "SINGLE='first line",
      "second \\ line'   ",
      'DOUBLE="first line',
      String.raw`second \$value \q"`,
      'DOUBLE_CONTINUED="left\\',
      'right"',
      "LIMOO_SMS_OTP_COPY='تک‌پی؛ رمز ورود شما: {0}'",
      String.raw`DOUBLE_ESCAPES="quoted \"value\" and \\ slash"`,
      "",
    ].join("\n"));

    assert.equal(parsed.get("SINGLE"), "first line\nsecond \\ line");
    assert.equal(parsed.get("DOUBLE"), "first line\nsecond $value \\q");
    assert.equal(parsed.get("DOUBLE_CONTINUED"), "leftright");
    assert.equal(parsed.get("LIMOO_SMS_OTP_COPY"), "تک‌پی؛ رمز ورود شما: {0}");
    assert.equal(parsed.get("DOUBLE_ESCAPES"), 'quoted "value" and \\ slash');
  });

  it("rejects malformed assignments, quotes and forbidden scalar values", () => {
    assert.throws(
      () => parseSystemdEnvironmentFile("1KEY=value\n"),
      /systemd_environment_file_key_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("\u00a0KEY=value\n"),
      /systemd_environment_file_key_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile('KEY="unterminated\n'),
      /systemd_environment_file_quote_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("KEY='value' suffix\n"),
      /systemd_environment_file_quote_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("KEY=bad\0value\n"),
      /systemd_environment_file_nul_forbidden/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("\ufeffKEY=value\n"),
      /systemd_environment_file_character_invalid/,
    );
    assert.throws(
      () => parseSystemdEnvironmentFile("KEY=\ud800\n"),
      /systemd_environment_file_character_invalid/,
    );
  });
});
