#!/usr/bin/env node
import { readFile, lstat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  buildProtectedRuntimeEnvironment,
  parseProtectedRuntimeEnvSource,
  validateProtectedRuntimeEnvFileStat,
} from "./protected-runtime-env-policy.mjs";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
if (separator !== 1 || args.length < 3) {
  throw new Error("usage: run-with-protected-runtime-env.mjs <env-file> -- <absolute-command> [args...]");
}

const envFile = path.normalize(args[0]);
const command = args[2];
const commandArgs = args.slice(3);
if (!path.isAbsolute(envFile) || envFile === path.parse(envFile).root || envFile.includes("\0")) {
  throw new Error("protected_runtime_env_path_invalid");
}
if (!path.isAbsolute(command)) {
  throw new Error("protected_runtime_command_must_be_absolute");
}

const expectedUid = Number(process.env.TECPEY_PROTECTED_ENV_EXPECTED_UID);
const expectedGid = Number(process.env.TECPEY_PROTECTED_ENV_EXPECTED_GID);
const stat = await lstat(envFile);
validateProtectedRuntimeEnvFileStat(stat, { expectedUid, expectedGid });
const parsed = parseProtectedRuntimeEnvSource(await readFile(envFile, "utf8"));
const env = buildProtectedRuntimeEnvironment(process.env, parsed.values);

const child = spawn(command, commandArgs, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: false,
});
child.on("error", (error) => {
  console.error(JSON.stringify({ ok: false, error: "protected_runtime_command_spawn_failed" }));
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(JSON.stringify({ ok: false, error: "protected_runtime_command_signaled", signal }));
    process.exitCode = 1;
    return;
  }
  process.exitCode = Number.isInteger(code) ? code : 1;
});
