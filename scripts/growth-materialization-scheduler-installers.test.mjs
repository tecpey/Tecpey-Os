import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const installers = [
  {
    path: "scripts/install-coin-growth-materialization-scheduler.sh",
    service: "tecpey-coin-growth-materialization.service",
    timer: "tecpey-coin-growth-materialization.timer",
    success: "coin_growth_materialization_timer=active",
  },
  {
    path: "scripts/install-tool-growth-materialization-scheduler.sh",
    service: "tecpey-tool-growth-materialization.service",
    timer: "tecpey-tool-growth-materialization.timer",
    success: "tool_growth_materialization_timer=active",
  },
];

for (const installer of installers) {
  test(`${installer.path} keeps the scheduler install contract fail-closed`, () => {
    const source = readFileSync(installer.path, "utf8");

    assert.match(source, /^set -euo pipefail$/m);
    assert.match(source, /DRY_RUN="\$\{DRY_RUN:-0\}"/);
    assert.match(source, /runtime_user_root_forbidden/);
    assert.match(source, /environment_file_world_access_forbidden/);
    assert.match(source, /environment_file_group_write_execute_forbidden/);
    assert.match(source, /systemd_directory_symlink_forbidden/);
    assert.match(source, /systemd_template_placeholder_unresolved/);
    assert.match(source, /systemd-analyze verify/);
    assert.match(source, new RegExp(`install -m 0644 .*${installer.service}`));
    assert.match(source, new RegExp(`install -m 0644 .*${installer.timer}`));
    assert.match(source, new RegExp(`systemctl enable --now ${installer.timer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(source, new RegExp(`systemctl is-enabled --quiet ${installer.timer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(source, new RegExp(`systemctl is-active --quiet ${installer.timer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(source, new RegExp(installer.success));
  });
}
