import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { safeJsonLd } from "../../lib/json-ld";

// JSON-LD is injected through dangerouslySetInnerHTML, and JSON.stringify does
// not escape `<`. A schema value containing the literal text `</script>` would
// close the tag early and turn the rest of the payload into live markup. Every
// TecPey schema is static today, so this is a latent rather than an active
// hole — which is exactly why it needs a guard that fails the moment someone
// adds a raw sink or feeds one from dynamic data.

const SOURCE_ROOT = path.resolve(import.meta.dirname, "../..");
const RAW_SINK = /__html:\s*JSON\.stringify\(/;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

describe("JSON-LD script escaping", () => {
  it("neutralizes a payload that tries to close the script tag", () => {
    const serialized = safeJsonLd({ name: "</script><img src=x onerror=alert(1)>" });

    assert.ok(!serialized.includes("</script>"), "closing tag must not survive serialization");
    assert.ok(!serialized.includes("<"), "no raw angle bracket may reach the script body");
    assert.ok(serialized.includes("\\u003c"), "angle brackets must be unicode-escaped");
  });

  it("escapes line separators that are legal in JSON but not in a script body", () => {
    const serialized = safeJsonLd({ note: "a\u2028b\u2029c" });

    assert.ok(!serialized.includes("\u2028"));
    assert.ok(!serialized.includes("\u2029"));
    assert.equal(serialized.includes("\\u2028"), true);
    assert.equal(serialized.includes("\\u2029"), true);
  });

  it("keeps the payload semantically identical for a JSON parser", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      name: "5 < 7 and 9 > 2",
      nested: [{ text: "</script>" }],
    };

    assert.deepEqual(JSON.parse(safeJsonLd(schema)), schema);
  });

  it("leaves no raw JSON.stringify sink anywhere in the source tree", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const source = await readFile(file, "utf8");
      if (RAW_SINK.test(source)) offenders.push(path.relative(SOURCE_ROOT, file));
    }

    assert.deepEqual(
      offenders,
      [],
      `dangerouslySetInnerHTML must serialize through safeJsonLd(), not JSON.stringify: ${offenders.join(", ")}`,
    );
  });
});
