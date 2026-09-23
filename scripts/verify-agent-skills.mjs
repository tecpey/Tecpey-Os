import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_SKILLS = Object.freeze([
  "code-review",
  "codebase-design",
  "diagnosing-bugs",
  "domain-modeling",
  "frontend-design",
  "supabase-postgres-best-practices",
  "tdd",
  "to-spec",
  "vercel-composition-patterns",
  "vercel-react-best-practices",
  "vercel-react-view-transitions",
  "web-design-guidelines",
  "webapp-testing",
]);

const ALLOWED_PUBLISHERS = new Set(["Vercel", "Anthropic", "Supabase", "Matt Pocock"]);
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".py", ".sh"]);
const SHA40 = /^[0-9a-f]{40}$/;
const SOURCE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseSkillName(content, filePath = "SKILL.md") {
  invariant(typeof content === "string" && content.startsWith("---\n"), `${filePath}: missing YAML frontmatter`);
  const end = content.indexOf("\n---", 4);
  invariant(end > 4, `${filePath}: unterminated YAML frontmatter`);
  const frontmatter = content.slice(4, end);
  const match = frontmatter.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))\s*$/m);
  invariant(match, `${filePath}: frontmatter name is missing`);
  return match[1] ?? match[2] ?? match[3];
}

function walkFiles(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    const stat = fs.lstatSync(absolute);
    invariant(!stat.isSymbolicLink(), `${absolute}: symlinks are forbidden in vendored skills`);
    if (entry.isDirectory()) {
      output.push(...walkFiles(absolute));
      continue;
    }
    invariant(entry.isFile(), `${absolute}: only regular files are allowed`);
    output.push({ absolute, stat });
  }
  return output;
}

function normalizeRelative(rootDir, absolute) {
  return path.relative(rootDir, absolute).split(path.sep).join("/");
}

export function verifyLockShape(lock) {
  invariant(lock?.schemaVersion === 1, "SKILLS_LOCK.json: unsupported schemaVersion");
  invariant(lock?.policy === "tecpey-agent-skills-v1", "SKILLS_LOCK.json: unexpected policy");
  invariant(Array.isArray(lock.skills), "SKILLS_LOCK.json: skills must be an array");
  invariant(lock.skills.length === EXPECTED_SKILLS.length, "SKILLS_LOCK.json: skill count drift");

  const names = lock.skills.map((entry) => entry.name).sort();
  invariant(JSON.stringify(names) === JSON.stringify(EXPECTED_SKILLS), "SKILLS_LOCK.json: expected skill set drift");

  const seen = new Set();
  for (const entry of lock.skills) {
    invariant(!seen.has(entry.name), `SKILLS_LOCK.json: duplicate skill ${entry.name}`);
    seen.add(entry.name);
    invariant(entry.path === `.agents/skills/${entry.name}`, `${entry.name}: non-canonical local path`);
    invariant(SOURCE_REPO.test(entry.sourceRepo ?? ""), `${entry.name}: invalid sourceRepo`);
    invariant(SHA40.test(entry.sourceCommit ?? ""), `${entry.name}: source commit must be a pinned SHA`);
    invariant(typeof entry.sourcePath === "string" && entry.sourcePath.startsWith("skills/"), `${entry.name}: invalid sourcePath`);
    invariant(ALLOWED_PUBLISHERS.has(entry.publisher), `${entry.name}: publisher is not allowlisted`);
    invariant(typeof entry.license === "string" && entry.license.length > 0, `${entry.name}: license metadata missing`);
    invariant(typeof entry.upstreamCommitVerified === "boolean", `${entry.name}: commit verification state missing`);
    invariant(typeof entry.modified === "boolean", `${entry.name}: modified flag missing`);
    if (entry.modified) {
      invariant(typeof entry.modification === "string" && entry.modification.length > 10, `${entry.name}: local modification rationale missing`);
    }
    if (!entry.upstreamCommitVerified) {
      invariant(typeof entry.reviewNote === "string" && entry.reviewNote.length > 10, `${entry.name}: unsigned upstream requires explicit review note`);
    }
    if (entry.secondarySource) {
      invariant(SOURCE_REPO.test(entry.secondarySource.repo ?? ""), `${entry.name}: invalid secondary source repo`);
      invariant(SHA40.test(entry.secondarySource.commit ?? ""), `${entry.name}: secondary source must be pinned`);
      invariant(typeof entry.secondarySource.path === "string" && entry.secondarySource.path.length > 0, `${entry.name}: secondary source path missing`);
    }
  }
  return true;
}

function verifyHelperLocation(relativePath) {
  if (relativePath.endsWith(".py")) {
    invariant(
      /^\.agents\/skills\/webapp-testing\/(?:scripts|examples)\/[A-Za-z0-9_.-]+\.py$/.test(relativePath),
      `${relativePath}: Python helper is outside the approved webapp-testing paths`,
    );
  }
  if (relativePath.endsWith(".sh")) {
    invariant(
      relativePath === ".agents/skills/diagnosing-bugs/scripts/hitl-loop.template.sh",
      `${relativePath}: shell helper is outside the approved diagnosing-bugs path`,
    );
  }
}

export function verifyAgentSkillsToolkit({ rootDir = process.cwd() } = {}) {
  const agentsRoot = path.join(rootDir, ".agents");
  const skillsRoot = path.join(agentsRoot, "skills");
  const lockPath = path.join(agentsRoot, "SKILLS_LOCK.json");
  invariant(fs.existsSync(lockPath), "missing .agents/SKILLS_LOCK.json");
  invariant(fs.existsSync(skillsRoot), "missing .agents/skills");

  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  verifyLockShape(lock);

  const actualDirectories = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  invariant(
    JSON.stringify(actualDirectories) === JSON.stringify(EXPECTED_SKILLS),
    ".agents/skills: unlocked skill directory drift",
  );

  for (const entry of lock.skills) {
    const skillRoot = path.join(rootDir, entry.path);
    const skillFile = path.join(skillRoot, "SKILL.md");
    invariant(fs.existsSync(skillFile), `${entry.name}: missing SKILL.md`);
    const skillContent = fs.readFileSync(skillFile, "utf8");
    invariant(parseSkillName(skillContent, normalizeRelative(rootDir, skillFile)) === entry.name, `${entry.name}: directory/frontmatter name mismatch`);

    const files = walkFiles(skillRoot);
    invariant(files.length > 0, `${entry.name}: empty skill directory`);
    for (const { absolute, stat } of files) {
      const relative = normalizeRelative(rootDir, absolute);
      invariant(stat.size <= 512 * 1024, `${relative}: vendored file exceeds 512 KiB`);
      invariant(ALLOWED_EXTENSIONS.has(path.extname(absolute)), `${relative}: unapproved vendored file type`);
      verifyHelperLocation(relative);
      const text = fs.readFileSync(absolute, "utf8");
      if (relative.endsWith("/SKILL.md")) {
        invariant(!/raw\.githubusercontent\.com\/[^\s)]+\/main\//i.test(text), `${relative}: mutable raw GitHub main URL is forbidden in skill instructions`);
        invariant(!/github\.com\/[^\s)]+\/blob\/main\//i.test(text), `${relative}: mutable GitHub main URL is forbidden in skill instructions`);
      }
    }
  }

  const pinnedGuidelines = fs.readFileSync(
    path.join(skillsRoot, "web-design-guidelines", "SKILL.md"),
    "utf8",
  );
  invariant(pinnedGuidelines.includes("GUIDELINES.md"), "web-design-guidelines: pinned local guideline reference missing");
  invariant(!pinnedGuidelines.includes("Fetch the latest guidelines"), "web-design-guidelines: mutable-fetch instruction restored");

  return {
    ok: true,
    policy: lock.policy,
    skillCount: lock.skills.length,
    unsignedReviewedUpstreams: lock.skills.filter((entry) => !entry.upstreamCommitVerified).length,
    locallyModifiedSkills: lock.skills.filter((entry) => entry.modified).map((entry) => entry.name),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(verifyAgentSkillsToolkit())}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
