import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMentorVectorSourceFiles } from "./mentor-vector-source-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "design/mentor/vector-source/v1-adobe/mentor-vector-source-pack.v1.json",
);

const document = JSON.parse(await readFile(manifestPath, "utf8"));
const result = await verifyMentorVectorSourceFiles(document, root);

if (!result.ok) {
  console.error("Mentor vector source pack: BLOCKED");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const paths = document.sources.reduce(
    (total, source) => total + source.pathCount,
    0,
  );
  console.log(
    `Mentor vector source pack: VERIFIED (${document.sources.length} SVGs, ${paths} trace paths).`,
  );
  console.log("Runtime import remains blocked until semantic Rive rebuild.");
}
