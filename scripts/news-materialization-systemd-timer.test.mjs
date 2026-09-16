import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tecpey-news-timer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);

  return { bin };
}

function installFakeSystemctl(bin) {
  writeExecutable(
    path.join(bin, "systemctl"),
    `#!/usr/bin/env bash
set -e
case "\${1:-}" in
  daemon-reload|enable|is-enabled|is-active)
    exit 0
    ;;
  show)
    case "$*" in
      *"--property=SubState"*)
        printf '%s\\n' "\${FAKE_TIMER_SUBSTATE:-waiting}"
        ;;
      *"--property=NextElapseUSecMonotonic"*)
        printf '%s\\n' "\${FAKE_TIMER_NEXT:-123456789}"
        ;;
      *)
        exit 2
        ;;
    esac
    ;;
  *)
    exit 2
    ;;
esac
`,
  );
}

test("timer verification rejects active-but-elapsed timer", (t) => {
  const { bin } = makeFixture(t);
  installFakeSystemctl(bin);

  const result = spawnSync(
    "/bin/bash",
    ["scripts/check-systemd-timer-scheduled.sh", "tecpey-news-materialization.timer"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_TIMER_SUBSTATE: "elapsed",
        FAKE_TIMER_NEXT: "infinity",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /timer_not_waiting/);
});

test("timer verification accepts waiting timer with finite next trigger", (t) => {
  const { bin } = makeFixture(t);
  installFakeSystemctl(bin);

  const result = spawnSync(
    "/bin/bash",
    ["scripts/check-systemd-timer-scheduled.sh", "tecpey-news-materialization.timer"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_TIMER_SUBSTATE: "waiting",
        FAKE_TIMER_NEXT: "123456789",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /timer_schedule=valid/);
});
