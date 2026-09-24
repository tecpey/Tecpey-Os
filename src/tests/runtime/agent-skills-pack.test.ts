import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type SkillSource = {
  name: string;
  repo: string;
  sourcePath: string;
  commit: string;
  license: string;
};

type SkillManifest = {
  schemaVersion: number;
  target: string;
  installPath: string;
  sources: SkillSource[];
};

const root = process.cwd();

test("TecPey agent skill pack is pinned, complete and internally consistent", async () => {
  const manifestPath = path.join(root, ".agents", "skills", "tecpey-sources.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SkillManifest;

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.target, "codex-project");
  assert.equal(manifest.installPath, ".agents/skills");
  assert.equal(manifest.sources.length, 8);

  const names = new Set<string>();
  for (const source of manifest.sources) {
    assert.match(source.name, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    assert.ok(source.repo.includes("/"));
    assert.ok(source.sourcePath.length > 0);
    assert.ok(source.license.length > 0);
    assert.equal(names.has(source.name), false, `duplicate skill: ${source.name}`);
    names.add(source.name);

    const skillPath = path.join(root, ".agents", "skills", source.name, "SKILL.md");
    assert.equal((await stat(skillPath)).isFile(), true, `missing SKILL.md: ${source.name}`);
    const skill = await readFile(skillPath, "utf8");
    const frontmatterName = skill.match(
      /^---\s*\n[\s\S]*?^name:\s*["']?([^"'\n]+)["']?\s*$/m,
    );
    assert.equal(
      frontmatterName?.[1]?.trim(),
      source.name,
      `frontmatter name mismatch: ${source.name}`,
    );
  }

  const requiredReferences = [
    ".agents/skills/vercel-react-best-practices/AGENTS.md",
    ".agents/skills/vercel-composition-patterns/AGENTS.md",
    ".agents/skills/security-review/references/vuln-categories.md",
    ".agents/skills/postgres-best-practices/references/security-roles.md",
    ".agents/skills/postgres-best-practices/references/transaction-isolation.md",
    ".agents/skills/frontend-design/LICENSE.txt",
    ".agents/skills/security-review/LICENSE.txt",
    ".agents/skills/agent-browser/LICENSE.txt",
    ".agents/skills/diagnosing-bugs/LICENSE.txt",
    ".agents/skills/postgres-best-practices/LICENSE.txt",
    "docs/agents/THIRD_PARTY_SKILL_NOTICES.md",
  ];

  for (const relativePath of requiredReferences) {
    assert.equal(
      (await stat(path.join(root, relativePath))).isFile(),
      true,
      `required skill-pack file missing: ${relativePath}`,
    );
  }
});

test("TecPey skill governance explicitly keeps repository authority above generic skill advice", async () => {
  const guide = await readFile(
    path.join(root, "docs", "agents", "TECPEY_AGENT_SKILLS_PACK.md"),
    "utf8",
  );
  assert.match(guide, /cannot:\n- authorize merge\/deploy;/);
  assert.match(guide, /TecPey's repository contract wins/);
  assert.match(guide, /exact upstream commit/i);
});
