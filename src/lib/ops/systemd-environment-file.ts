const KEY = /^[A-Z][A-Z0-9_]*$/;

function decodeUnquoted(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && index + 1 < value.length) {
      index += 1;
    }
    output += value[index];
  }
  return output;
}

function decodeDoubleQuoted(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];
    if (current === "\\" && next && ['"', "\\", "`", "$"].includes(next)) {
      output += next;
      index += 1;
      continue;
    }
    output += current;
  }
  return output;
}

function parseValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const quote = value[0];
  if (quote === "'" || quote === '"') {
    if (value.length < 2 || value[value.length - 1] !== quote) {
      throw new Error("systemd_environment_file_quote_invalid");
    }
    const inner = value.slice(1, -1);
    return quote === "'" ? inner : decodeDoubleQuoted(inner);
  }
  return decodeUnquoted(value);
}

export function parseSystemdEnvironmentFile(source: string): Map<string, string> {
  if (source.includes("\0")) {
    throw new Error("systemd_environment_file_nul_forbidden");
  }
  const values = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error("systemd_environment_file_assignment_invalid");
    }
    const key = line.slice(0, separator).trim();
    if (!KEY.test(key) || values.has(key)) {
      throw new Error("systemd_environment_file_key_invalid");
    }
    values.set(key, parseValue(line.slice(separator + 1)));
  }
  return values;
}
