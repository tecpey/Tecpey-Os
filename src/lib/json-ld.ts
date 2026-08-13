// Safe JSON-LD serialization for <script type="application/ld+json"> blocks.
//
// JSON.stringify is not safe for an HTML script context: it leaves `<`
// untouched, so a value containing the literal text `</script>` closes the tag
// early and everything after it is parsed as markup. Today every TecPey schema
// is built from static in-repo content with allow-listed slugs, so no such
// value can reach a sink — but the sinks are generic, and the first schema
// field fed from the database or from user input would turn each one into a
// stored-XSS vector.
//
// Escaping `<` and `>` as unicode sequences keeps the JSON semantically
// identical (a JSON parser resolves < back to `<`) while making the tag
// impossible to break out of. U+2028 and U+2029 are escaped too: they are
// valid inside a JSON string but terminate a line in a JavaScript source
// context, so escaping them keeps the payload safe if it is ever inlined
// somewhere other than an ld+json block.

const HTML_UNSAFE = /[<>\u2028\u2029]/g;

const REPLACEMENTS: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serializes a JSON-LD schema (or array of schemas) for safe embedding in a
 * `<script type="application/ld+json">` block. Always use this instead of
 * JSON.stringify when the result flows into dangerouslySetInnerHTML.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(HTML_UNSAFE, (char) => REPLACEMENTS[char]);
}
