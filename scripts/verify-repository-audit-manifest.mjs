import fs from "node:fs/promises";
import path from "node:path";
import { validateRepositoryAuditManifest } from "./repository-audit-manifest.mjs";

const inputPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "artifacts/repository-audit/repository-manifest.json",
);
const manifest = JSON.parse(await fs.readFile(inputPath, "utf8"));
const summary = await validateRepositoryAuditManifest(manifest);

console.log(
  `Verified repository audit denominator: ${summary.trackedPaths} tracked paths, ${summary.lines} text lines`,
);
