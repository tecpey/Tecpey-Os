import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

// This guard matches text, so it cannot tell a file that *uses* the shared
// credential from one that *asserts about* how it is used. The allowlist is
// therefore only for the bootstrap implementation and for the security tests that
// hold that implementation in place — never for a new consumer.
const rules = [
  {
    name: "shared admin environment token",
    pattern: /TECPEY_ADMIN_TOKEN/,
    allowedFiles: new Set([
      "src/lib/admin-passkey-service.ts",
      "src/tests/security/admin-passkey-backend.test.ts",
      // SB-002: asserts the token stays a header secret and never reaches a
      // cookie or browser-shipped code. It strengthens this boundary rather than
      // crossing it.
      "src/tests/security/control-plane-cookie-opacity.test.ts",
    ]),
  },
  {
    name: "shared admin request header",
    pattern: /x-tecpey-admin-token/,
    allowedFiles: new Set([
      "src/lib/admin-passkey-service.ts",
      "src/components/admin/AdminPasskeyAccessGate.tsx",
      "src/tests/security/admin-passkey-backend.test.ts",
      "src/tests/security/control-plane-cookie-opacity.test.ts",
    ]),
  },
  {
    name: "retired shared admin cookie",
    pattern: /tecpey_admin_session/,
    allowedFiles: new Set(),
  },
  {
    name: "retired legacy admin session helper",
    pattern: /(?:setAdminSessionCookie|clearAdminSessionCookie|ADMIN_SESSION_COOKIE)/,
    allowedFiles: new Set(),
  },
  {
    name: "retired environment-based admin configuration helper",
    pattern: /isAdminConfigured/,
    allowedFiles: new Set(),
  },
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const violations = [];
for (const absolute of await walk(ROOT)) {
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  const lines = (await fs.readFile(absolute, "utf8")).split(/\r?\n/);

  for (const rule of rules) {
    if (rule.allowedFiles.has(relative)) continue;
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        violations.push(`${relative}:${index + 1}: ${rule.name}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Administrator authentication boundary violated.\n");
  console.error(violations.join("\n"));
  console.error("\nShared administrator credentials are permitted only for the one-time bootstrap ceremony. Normal access must use an individual server-side admin principal.");
  process.exit(1);
}

console.log("Admin authentication boundary guard passed: shared credentials remain bootstrap-only.");
