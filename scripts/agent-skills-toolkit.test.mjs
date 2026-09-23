import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseSkillName,
  verifyAgentSkillsToolkit,
  verifyLockShape,
} from "./verify-agent-skills.mjs";

test("installed TecPey agent skills pass the supply-chain verifier", () => {
  const result = verifyAgentSkillsToolkit({ rootDir: process.cwd() });
  assert.equal(result.ok, true);
  assert.equal(result.skillCount, 13);
  assert.deepEqual(result.locallyModifiedSkills, ["web-design-guidelines"]);
});

test("frontmatter parser returns the canonical skill name", () => {
  assert.equal(parseSkillName("---\nname: example-skill\ndescription: test\n---\n# Skill"), "example-skill");
  assert.throws(() => parseSkillName("# Missing frontmatter"), /missing YAML frontmatter/);
});

test("lock validation rejects mutable refs, unknown publishers and unsigned unreviewed sources", () => {
  const installed = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".agents", "SKILLS_LOCK.json"), "utf8"));

  const mutable = structuredClone(installed);
  mutable.skills[0].sourceCommit = "main";
  assert.throws(() => verifyLockShape(mutable), /pinned SHA/);

  const unknownPublisher = structuredClone(installed);
  unknownPublisher.skills[0].publisher = "Unknown Marketplace";
  assert.throws(() => verifyLockShape(unknownPublisher), /not allowlisted/);

  const unsigned = structuredClone(installed);
  const target = unsigned.skills.find((entry) => entry.name === "to-spec");
  delete target.reviewNote;
  assert.throws(() => verifyLockShape(unsigned), /unsigned upstream requires explicit review note/);
});

test("verifier rejects untracked skill directories and symlinked vendored content", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-agent-skills-"));
  fs.cpSync(path.join(process.cwd(), ".agents"), path.join(temp, ".agents"), { recursive: true });

  fs.mkdirSync(path.join(temp, ".agents", "skills", "rogue-skill"));
  assert.throws(
    () => verifyAgentSkillsToolkit({ rootDir: temp }),
    /unlocked skill directory drift/,
  );

  fs.rmSync(path.join(temp, ".agents", "skills", "rogue-skill"), { recursive: true, force: true });
  const target = path.join(temp, ".agents", "skills", "webapp-testing", "examples", "rogue.py");
  fs.symlinkSync(path.join(temp, ".agents", "README.md"), target);
  assert.throws(
    () => verifyAgentSkillsToolkit({ rootDir: temp }),
    /symlinks are forbidden/,
  );

  fs.rmSync(temp, { recursive: true, force: true });
});
