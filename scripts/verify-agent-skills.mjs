import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, ".agents", "skills", "tecpey-sources.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== 1 || manifest.target !== "codex-project") {
  throw new Error("agent_skills_manifest_contract_invalid");
}
if (!Array.isArray(manifest.sources) || manifest.sources.length !== 8) {
  throw new Error("agent_skills_manifest_source_count_invalid");
}

const names = new Set();
for (const source of manifest.sources) {
  if (
    !source ||
    typeof source.name !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(source.name) ||
    typeof source.repo !== "string" ||
    typeof source.sourcePath !== "string" ||
    !/^[0-9a-f]{40}$/.test(source.commit)
  ) {
    throw new Error("agent_skills_manifest_source_invalid");
  }
  if (names.has(source.name)) throw new Error("agent_skills_duplicate_name");
  names.add(source.name);

  const skillPath = path.join(root, ".agents", "skills", source.name, "SKILL.md");
  const skillStat = await stat(skillPath);
  if (!skillStat.isFile()) throw new Error(`agent_skill_missing:${source.name}`);

  const skill = await readFile(skillPath, "utf8");
  const nameMatch = skill.match(/^---\s*\n[\s\S]*?^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!nameMatch || nameMatch[1].trim() !== source.name) {
    throw new Error(`agent_skill_frontmatter_name_mismatch:${source.name}`);
  }
}

for (const required of [
  ".agents/skills/vercel-react-best-practices/AGENTS.md",
  ".agents/skills/vercel-composition-patterns/AGENTS.md",
  ".agents/skills/security-review/references/vuln-categories.md",
  ".agents/skills/postgres-best-practices/references/security-roles.md",
  ".agents/skills/postgres-best-practices/references/transaction-isolation.md",
]) {
  const target = await stat(path.join(root, required));
  if (!target.isFile()) throw new Error(`agent_skill_required_reference_missing:${required}`);
}

process.stdout.write(JSON.stringify({
  ok: true,
  evidenceClass: "tecpey-agent-skills-pack-v1",
  installedSkills: [...names].sort(),
}) + "\n");
