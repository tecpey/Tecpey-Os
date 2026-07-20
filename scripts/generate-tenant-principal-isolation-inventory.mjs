import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const SOURCE_PATH =
  "docs/security/tenant-principal-isolation-inventory.source.json";
const EXCEPTIONS_PATH =
  "docs/security/tenant-principal-isolation-exceptions.json";
const OUTPUT_PATH =
  "docs/security/generated/tenant-principal-isolation-inventory.json";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

function encoded(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function assertToken(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
}

async function normalizeEntry(entry) {
  assertToken(entry.id, "inventory entry id");
  assertToken(entry.surfaceType, `${entry.id}.surfaceType`);
  assertToken(entry.authority, `${entry.id}.authority`);
  assertToken(entry.status, `${entry.id}.status`);
  assertToken(entry.ownerIssue, `${entry.id}.ownerIssue`);
  if (!/^#\d+$/.test(entry.ownerIssue)) {
    throw new Error(`${entry.id}.ownerIssue must be a GitHub issue`);
  }

  const invariants = [...new Set(entry.requiredInvariants ?? [])].sort();
  if (entry.sourcePath === null) {
    if (entry.surfaceType !== "object_storage" || entry.status !== "not_present") {
      throw new Error(`${entry.id} may omit sourcePath only for absent object storage`);
    }
    if (invariants.length) {
      throw new Error(`${entry.id} cannot declare source invariants without a sourcePath`);
    }
  } else {
    assertToken(entry.sourcePath, `${entry.id}.sourcePath`);
    const source = await readFile(entry.sourcePath, "utf8");
    for (const invariant of invariants) {
      if (!source.includes(invariant)) {
        throw new Error(
          `${entry.id} reviewed invariant drifted in ${entry.sourcePath}: ${invariant}`,
        );
      }
    }
  }

  const normalized = {
    ...entry,
    requiredInvariants: invariants,
  };
  return {
    ...normalized,
    reviewDigest: digest(JSON.stringify(stable(normalized))),
  };
}

async function validateExceptions(registry) {
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.exceptions)) {
    throw new Error("invalid tenant isolation exception registry");
  }
  const ids = new Set();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const exception of registry.exceptions) {
    assertToken(exception.id, "exception id");
    if (ids.has(exception.id)) throw new Error(`duplicate exception ${exception.id}`);
    ids.add(exception.id);
    assertToken(exception.owner, `${exception.id}.owner`);
    assertToken(exception.issue, `${exception.id}.issue`);
    assertToken(exception.reason, `${exception.id}.reason`);
    assertToken(exception.compensatingControl, `${exception.id}.compensatingControl`);
    assertToken(exception.sourcePath, `${exception.id}.sourcePath`);
    if (!/^#\d+$/.test(exception.issue)) {
      throw new Error(`${exception.id}.issue must be a GitHub issue`);
    }
    await readFile(exception.sourcePath, "utf8");
    const expiry = new Date(`${exception.expiresOn}T00:00:00.000Z`);
    if (!Number.isFinite(expiry.getTime()) || expiry <= today) {
      throw new Error(`${exception.id} is expired or has an invalid expiresOn`);
    }
  }
}

async function buildInventory() {
  const [source, exceptions] = await Promise.all([
    readFile(SOURCE_PATH, "utf8").then(JSON.parse),
    readFile(EXCEPTIONS_PATH, "utf8").then(JSON.parse),
  ]);
  if (source.schemaVersion !== 1 || !Array.isArray(source.entries)) {
    throw new Error("invalid tenant isolation inventory source");
  }
  await validateExceptions(exceptions);

  const ids = new Set();
  const entries = [];
  for (const entry of source.entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate inventory entry ${entry.id}`);
    ids.add(entry.id);
    entries.push(await normalizeEntry(entry));
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));

  const required = [...new Set(source.requiredSurfaceTypes ?? [])].sort();
  const present = new Set(entries.map((entry) => entry.surfaceType));
  for (const surfaceType of required) {
    if (!present.has(surfaceType)) {
      throw new Error(`required isolation surface type is missing: ${surfaceType}`);
    }
  }

  return {
    schemaVersion: 1,
    ownerIssue: source.ownerIssue,
    generatedFrom: SOURCE_PATH,
    exceptionRegistry: EXCEPTIONS_PATH,
    exceptionRegistryDigest: digest(encoded(exceptions)),
    requiredSurfaceTypes: required,
    entries,
  };
}

const inventory = await buildInventory();
const output = encoded(inventory);
if (process.argv.includes("--write")) {
  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
} else {
  const existing = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
  if (existing !== output) {
    console.error(
      `Tenant/principal isolation inventory drifted. Run: node ${process.argv[1]} --write`,
    );
    process.exit(1);
  }
  console.log(
    "Tenant/principal isolation inventory passed: reviewed semantic invariants, required surface categories and governed exceptions are current.",
  );
}
