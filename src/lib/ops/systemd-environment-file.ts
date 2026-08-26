const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ParsedValue = {
  value: string;
  nextOffset: number;
};

function assertValidSource(source: string): void {
  for (let offset = 0; offset < source.length; offset += 1) {
    const codePoint = source.codePointAt(offset);
    if (codePoint === undefined) break;
    if (codePoint > 0xffff) offset += 1;
    const nonCharacter =
      (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
      (codePoint & 0xffff) === 0xfffe ||
      (codePoint & 0xffff) === 0xffff;
    const loneSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
    if (codePoint === 0) {
      throw new Error("systemd_environment_file_nul_forbidden");
    }
    if (codePoint === 0xfeff || nonCharacter || loneSurrogate) {
      throw new Error("systemd_environment_file_character_invalid");
    }
  }
}

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\r";
}

function trimHorizontal(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isHorizontalWhitespace(value[start])) start += 1;
  while (end > start && isHorizontalWhitespace(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

function afterLine(source: string, lineEnd: number): number {
  return source[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
}

function lineEnd(source: string, offset: number): number {
  const newline = source.indexOf("\n", offset);
  return newline < 0 ? source.length : newline;
}

function parseUnquoted(source: string, offset: number): ParsedValue {
  const output: Array<{ character: string; escaped: boolean }> = [];
  let cursor = offset;

  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\n") {
      cursor += 1;
      break;
    }
    if (character === "\\") {
      const next = source[cursor + 1];
      if (next === "\n") {
        cursor += 2;
        continue;
      }
      if (next !== undefined) {
        output.push({ character: next, escaped: true });
        cursor += 2;
        continue;
      }
    }
    output.push({ character, escaped: false });
    cursor += 1;
  }

  while (
    output.length > 0 &&
    !output[output.length - 1].escaped &&
    isHorizontalWhitespace(output[output.length - 1].character)
  ) {
    output.pop();
  }

  return {
    value: output.map(({ character }) => character).join(""),
    nextOffset: cursor,
  };
}

function parseQuoted(
  source: string,
  offset: number,
  quote: "'" | '"',
): ParsedValue {
  let value = "";
  let cursor = offset + 1;

  while (cursor < source.length) {
    const character = source[cursor];
    if (character === quote) {
      cursor += 1;
      while (isHorizontalWhitespace(source[cursor])) cursor += 1;
      if (cursor < source.length && source[cursor] !== "\n") {
        throw new Error("systemd_environment_file_quote_invalid");
      }
      return {
        value,
        nextOffset: source[cursor] === "\n" ? cursor + 1 : cursor,
      };
    }
    if (quote === '"' && character === "\\") {
      const next = source[cursor + 1];
      if (next === "\n") {
        cursor += 2;
        continue;
      }
      if (next && ['"', "\\", "`", "$"].includes(next)) {
        value += next;
        cursor += 2;
        continue;
      }
    }
    value += character;
    cursor += 1;
  }

  throw new Error("systemd_environment_file_quote_invalid");
}

function parseValue(
  source: string,
  valueOffset: number,
  initialLineEnd: number,
): ParsedValue {
  let cursor = valueOffset;
  while (cursor < initialLineEnd && isHorizontalWhitespace(source[cursor])) {
    cursor += 1;
  }
  if (cursor === initialLineEnd) {
    return { value: "", nextOffset: afterLine(source, initialLineEnd) };
  }
  const quote = source[cursor];
  if (quote === "'" || quote === '"') {
    return parseQuoted(source, cursor, quote);
  }
  return parseUnquoted(source, cursor);
}

export function parseSystemdEnvironmentFile(source: string): Map<string, string> {
  assertValidSource(source);
  const normalized = source.replace(/\r\n/g, "\n");
  const values = new Map<string, string>();
  let offset = 0;

  while (offset < normalized.length) {
    const end = lineEnd(normalized, offset);
    const physicalLine = normalized.slice(offset, end);
    const meaningful = trimHorizontal(physicalLine);
    if (!meaningful || meaningful.startsWith("#") || meaningful.startsWith(";")) {
      offset = afterLine(normalized, end);
      continue;
    }

    const separator = physicalLine.indexOf("=");
    if (separator < 0) {
      offset = afterLine(normalized, end);
      continue;
    }
    const key = trimHorizontal(physicalLine.slice(0, separator));
    if (!KEY.test(key)) {
      throw new Error("systemd_environment_file_key_invalid");
    }

    const parsed = parseValue(normalized, offset + separator + 1, end);
    values.set(key, parsed.value);
    offset = parsed.nextOffset;
  }

  return values;
}
