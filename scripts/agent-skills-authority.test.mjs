import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SKILLS_ROOT = path.join(ROOT, ".agents", "skills");
const MANIFEST_PATH = path.join(ROOT, "docs", "agents", "tecpey-agent-skills.json");
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".py", ".sh", ".ts"]);
const MAX_FILE_BYTES = 1024 * 1024;
const SHA40 = /^[0-9a-f]{40}$/;

async function collectFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    const stat = await lstat(absolute);
    assert.equal(stat.isSymbolicLink(), false, `vendored skill path must not be a symlink: ${relative}`);
    if (stat.isDirectory()) {
      files.push(...await collectFiles(absolute, relative));
      continue;
    }
    assert.equal(stat.isFile(), true, `vendored skill path must be a regular file: ${relative}`);
    assert.equal(stat.mode & 0o111, 0, `vendored skill helper must not be executable: ${relative}`);
    assert.ok(stat.size <= MAX_FILE_BYTES, `vendored skill file exceeds 1 MiB: ${relative}`);
    assert.ok(ALLOWED_EXTENSIONS.has(path.extname(entry.name)), `unexpected vendored skill file type: ${relative}`);
    files.push(relative);
  }
  return files.sort();
}

function gitBlobSha(content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return createHash("sha1")
    .update(Buffer.from(`blob ${body.length}\0`))
    .update(body)
    .digest("hex");
}

function parseFrontmatterName(content) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(content);
  assert.ok(match, "SKILL.md must contain YAML frontmatter");
  const nameLine = match[1].split("\n").find((line) => /^name\s*:/.test(line.trim()));
  assert.ok(nameLine, "SKILL.md frontmatter must declare name");
  const raw = nameLine.trim().replace(/^name\s*:\s*/, "").trim();
  return raw.replace(/^["']|["']$/g, "");
}

test("TecPey project-local agent skills match the pinned provenance allowlist", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.policy, "tecpey-pinned-project-agent-skills-v1");
  assert.equal(typeof manifest.skills, "object");
  assert.ok(manifest.skills && !Array.isArray(manifest.skills));
  assert.equal(manifest.integrity?.algorithm, "git-blob-sha1");
  assert.equal(manifest.integrity?.fileCount, 30);

  const manifestNames = Object.keys(manifest.skills).sort();
  assert.equal(manifestNames.length, 11, "curated skill count must be explicit");

  const installedEntries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const installedNames = installedEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    installedNames,
    manifestNames,
    "installed skill directories must exactly match the reviewed manifest allowlist",
  );

  for (const entry of installedEntries) {
    assert.equal(entry.isSymbolicLink(), false, `skill root entry must not be a symlink: ${entry.name}`);
    assert.equal(entry.isDirectory(), true, `unexpected non-directory entry under .agents/skills: ${entry.name}`);
  }

  for (const skillName of manifestNames) {
    const metadata = manifest.skills[skillName];
    assert.equal(typeof metadata.source, "string", `${skillName}: source required`);
    assert.match(metadata.source, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, `${skillName}: source must be owner/repo`);
    assert.match(metadata.sourceCommit, SHA40, `${skillName}: sourceCommit must be exact lowercase SHA`);
    assert.equal(typeof metadata.sourcePath, "string", `${skillName}: sourcePath required`);
    assert.ok(metadata.sourcePath.endsWith("/SKILL.md"), `${skillName}: sourcePath must end in SKILL.md`);
    assert.equal(typeof metadata.license, "string", `${skillName}: license declaration required`);
    assert.ok(metadata.license.trim().length > 0, `${skillName}: license declaration cannot be blank`);
    assert.ok(Array.isArray(metadata.requiredFiles) && metadata.requiredFiles.length > 0, `${skillName}: requiredFiles required`);
    assert.ok(Array.isArray(metadata.fileLocks), `${skillName}: fileLocks required`);

    const directory = path.join(SKILLS_ROOT, skillName);
    const files = await collectFiles(directory);
    assert.ok(files.includes("SKILL.md"), `${skillName}: SKILL.md missing`);
    assert.deepEqual(
      files,
      [...metadata.requiredFiles].sort(),
      `${skillName}: vendored file set must exactly match the reviewed requiredFiles allowlist`,
    );
    const locks = new Map(metadata.fileLocks.map((entry) => [entry.path, entry.gitBlob]));
    assert.deepEqual(
      [...locks.keys()].sort(),
      [...metadata.requiredFiles].sort(),
      `${skillName}: every required file must have an immutable upstream blob lock`,
    );
    assert.equal(locks.size, metadata.fileLocks.length, `${skillName}: duplicate file lock path`);

    for (const required of metadata.requiredFiles) {
      assert.equal(path.isAbsolute(required), false, `${skillName}: required file must be relative`);
      assert.equal(required.includes(".."), false, `${skillName}: required file may not traverse directories`);
      assert.ok(files.includes(required), `${skillName}: missing required file ${required}`);
      assert.match(locks.get(required), /^[0-9a-f]{40}$/, `${skillName}/${required}: invalid Git blob lock`);
      const bytes = await readFile(path.join(directory, required));
      assert.equal(
        gitBlobSha(bytes),
        locks.get(required),
        `${skillName}/${required}: vendored bytes differ from the pinned upstream Git blob`,
      );
    }

    const skillFile = await readFile(path.join(directory, "SKILL.md"), "utf8");
    assert.equal(
      parseFrontmatterName(skillFile),
      skillName,
      `${skillName}: directory name must equal frontmatter skill name`,
    );

    assert.equal(
      skillFile.includes("BEGIN OPENSSH PRIVATE KEY"),
      false,
      `${skillName}: private-key material is forbidden`,
    );
    assert.equal(
      skillFile.includes("BEGIN PRIVATE KEY"),
      false,
      `${skillName}: private-key material is forbidden`,
    );
  }
});

test("vendored skills contain only reviewed text/code helper formats", async () => {
  const files = await collectFiles(SKILLS_ROOT);
  assert.ok(files.length >= 11, "expected vendored skill files");
  for (const forbiddenSegment of ["node_modules/", ".git/", "__pycache__/", ".DS_Store"]) {
    assert.equal(
      files.some((file) => file.includes(forbiddenSegment)),
      false,
      `vendored skills may not contain ${forbiddenSegment}`,
    );
  }
});

test("root governance keeps external skills subordinate to TecPey authorities", async () => {
  const agents = await readFile(path.join(ROOT, "AGENTS.md"), "utf8");
  const governance = await readFile(path.join(ROOT, "docs", "agents", "TECPEY_AGENT_SKILLS.md"), "utf8");

  assert.match(agents, /TecPey external agent skills/);
  assert.match(agents, /never override TecPey repository security/i);
  assert.match(governance, /No skill may authorize merge\/deploy/i);
  assert.match(governance, /No \`@latest\`/);
});
