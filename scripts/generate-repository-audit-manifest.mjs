import fs from "node:fs/promises";
import path from "node:path";
import { generateRepositoryAuditManifest } from "./repository-audit-manifest.mjs";

const outputPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "artifacts/repository-audit/repository-manifest.json",
);
const manifest = await generateRepositoryAuditManifest();
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  flag: "w",
});

console.log(
  `Repository audit manifest: ${manifest.summary.trackedPaths} tracked paths, ${manifest.summary.lines} text lines, ${manifest.sourceCommitSha}`,
);
