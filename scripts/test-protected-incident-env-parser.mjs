import assert from "node:assert/strict";

function parse(text) {
  const values = new Map();
  const parseValue = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return null;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
    if (/\s/.test(value)) return null;
    return value;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || values.has(match[1])) throw new Error("format");
    const parsedValue = parseValue(match[2]);
    if (parsedValue === null) throw new Error("format");
    values.set(match[1], parsedValue);
  }
  return values;
}

assert.equal(parse("DATABASE_URL = 'postgres://u:p@db/x'\nexport TECPEY_OPS_ALERT_WEBHOOK_URL=\"https://alerts.example/hook\"\n").get("DATABASE_URL"), "postgres://u:p@db/x");
assert.equal(parse("NODE_EXTRA_CA_CERTS = /etc/ssl/custom.pem\n").get("NODE_EXTRA_CA_CERTS"), "/etc/ssl/custom.pem");
assert.throws(() => parse("A=one\nA=two\n"));
assert.throws(() => parse("A=unquoted value\n"));
assert.throws(() => parse("A=\n"));
assert.throws(() => parse("lower=value\n"));
console.log("protected incident env parser cases: ok");
