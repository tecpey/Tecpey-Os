import { createHash, randomInt, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { constants as fsConstants, createReadStream } from "node:fs";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  DOMAIN_TABLES,
  FINANCIAL_INVARIANT_QUERIES,
  assertFinancialInvariantCounts,
  assertSummariesMatch,
  assertTenantRegistryCoverage,
  combinedBackupDigest,
  parseSafeCount,
  summarizeDomain,
  tableFingerprintQuery,
} from "./protected-recovery-reconciliation-collector-policy.mjs";
import { verifyProtectedRecoveryReconciliationEvidence } from "./verify-protected-recovery-reconciliation-evidence.mjs";

const execFile = promisify(execFileCallback);
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DOMAIN_NAMES = Object.freeze({
  academy: "Academy",
  tradingArena: "Trading Arena",
  mentorAi: "Mentor AI",
  exchangeLedger: "Exchange Ledger",
  notificationsOperationalJobs: "Notifications and operational jobs",
  tenantPrincipalIsolation: "Tenant and principal isolation",
});

function requireEnvironment(name, pattern) {
  const value = process.env[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) throw new Error(`${name.toLowerCase()}_invalid`);
  return value;
}

function parseEnvironmentFile(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s]*)$/u.exec(line);
    if (!match || match[2] === "" || Object.hasOwn(values, match[1])) {
      throw new Error("environment_file_line_invalid");
    }
    let value = match[2].trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function run(command, args, options = {}) {
  try {
    return await execFile(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: options.timeout ?? 120_000,
      env: options.env ?? process.env,
      cwd: options.cwd,
    });
  } catch {
    throw new Error(`${options.label ?? path.basename(command)}_failed`);
  }
}

async function requireExecutable(command) {
  await run(command, ["--version"], { label: `${command}_preflight`, timeout: 10_000 });
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function postgresEnvironment(databaseUrl, extraCaPath) {
  const parsed = new URL(databaseUrl);
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("database_url_scheme_invalid");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (!parsed.hostname || !database || !parsed.username) throw new Error("database_url_invalid");
  const env = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
    PGCONNECT_TIMEOUT: "10",
  };
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  if (extraCaPath) env.PGSSLROOTCERT = extraCaPath;
  return env;
}

function redisCommand(redisUrl, extraCaPath, tail) {
  const parsed = new URL(redisUrl);
  if (!new Set(["redis:", "rediss:"]).has(parsed.protocol)) {
    throw new Error("redis_url_scheme_invalid");
  }
  if (!parsed.hostname) throw new Error("redis_url_invalid");
  const database = parsed.pathname.replace(/^\//u, "") || "0";
  if (!/^(?:0|[1-9][0-9]*)$/u.test(database)) throw new Error("redis_database_invalid");
  const args = ["-h", parsed.hostname, "-p", parsed.port || (parsed.protocol === "rediss:" ? "6380" : "6379")];
  if (parsed.username) args.push("--user", decodeURIComponent(parsed.username));
  if (parsed.protocol === "rediss:") {
    args.push("--tls");
    if (extraCaPath) args.push("--cacert", extraCaPath);
  }
  args.push("-n", database, ...tail);
  return {
    args,
    database,
    env: {
      ...process.env,
      REDISCLI_AUTH: decodeURIComponent(parsed.password),
    },
  };
}

async function redisSourceCount(redisUrl, extraCaPath) {
  const command = redisCommand(redisUrl, extraCaPath, ["DBSIZE"]);
  const result = await run("redis-cli", command.args, {
    env: command.env,
    label: "redis_source_dbsize",
    timeout: 30_000,
  });
  return parseSafeCount(result.stdout.trim(), "redis_source_key_count");
}

async function collectTableMetrics(client, tables) {
  const metrics = [];
  for (const table of tables) {
    const result = await client.query(tableFingerprintQuery(table));
    if (result.rows.length !== 1) throw new Error(`${table}_fingerprint_missing`);
    metrics.push({
      table,
      rowCount: result.rows[0].row_count,
      rowDigest: result.rows[0].row_digest,
    });
  }
  return metrics;
}

async function migrationState(client) {
  const result = await client.query(
    "SELECT status, plan_hash FROM _migration_runtime_state WHERE singleton = TRUE LIMIT 1",
  );
  if (
    result.rows.length !== 1
    || result.rows[0].status !== "current"
    || !SHA256.test(result.rows[0].plan_hash ?? "")
  ) {
    throw new Error("migration_state_not_current");
  }
  return result.rows[0].plan_hash;
}

async function financialInvariantCounts(client) {
  const counts = {};
  for (const invariant of FINANCIAL_INVARIANT_QUERIES) {
    const result = await client.query(invariant.sql);
    if (result.rows.length !== 1) throw new Error(`${invariant.name}_financial_invariant_missing`);
    counts[invariant.name] = parseSafeCount(
      result.rows[0].divergence_count,
      `${invariant.name}_financial_invariant_count`,
    );
  }
  return assertFinancialInvariantCounts(counts);
}

async function tenantRuntimeTables(client) {
  const result = await client.query(`
    SELECT DISTINCT column_name.table_name
      FROM information_schema.columns column_name
      JOIN information_schema.tables relation
        ON relation.table_schema = column_name.table_schema
       AND relation.table_name = column_name.table_name
     WHERE column_name.table_schema = 'public'
       AND column_name.column_name = 'tenant_id'
       AND relation.table_type = 'BASE TABLE'
     ORDER BY column_name.table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function tableColumnSets(client, tables) {
  const result = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [tables],
  );
  const columns = new Map(tables.map((table) => [table, new Set()]));
  for (const row of result.rows) columns.get(row.table_name)?.add(row.column_name);
  return columns;
}

async function countResult(client, sql, label) {
  const result = await client.query(sql);
  if (result.rows.length !== 1) throw new Error(`${label}_missing`);
  return parseSafeCount(result.rows[0].divergence_count, label);
}

async function tenantInvariantCounts(client, registryTables) {
  const actualTables = await tenantRuntimeTables(client);
  const governedTables = assertTenantRegistryCoverage(registryTables, actualTables);
  const columns = await tableColumnSets(client, governedTables);
  let orphanTenantRows = 0;
  let orphanWorkspaceRows = 0;
  let principalBindingMismatches = 0;

  for (const table of governedTables) {
    const identifier = `"${table}"`;
    orphanTenantRows += await countResult(
      client,
      `SELECT COUNT(*)::text AS divergence_count
         FROM ${identifier} governed
         LEFT JOIN platform_tenants tenant ON tenant.id = governed.tenant_id
        WHERE tenant.id IS NULL`,
      `${table}_orphan_tenant_count`,
    );
    const tableColumns = columns.get(table);
    if (tableColumns?.has("workspace_id")) {
      orphanWorkspaceRows += await countResult(
        client,
        `SELECT COUNT(*)::text AS divergence_count
           FROM ${identifier} governed
           LEFT JOIN platform_workspaces workspace
             ON workspace.id = governed.workspace_id
            AND workspace.tenant_id = governed.tenant_id
          WHERE governed.workspace_id IS NOT NULL
            AND workspace.id IS NULL`,
        `${table}_orphan_workspace_count`,
      );
    }
    if (
      tableColumns?.has("workspace_id")
      && tableColumns.has("principal_type")
      && tableColumns.has("principal_id")
    ) {
      principalBindingMismatches += await countResult(
        client,
        `SELECT COUNT(*)::text AS divergence_count
           FROM ${identifier} governed
           LEFT JOIN platform_principal_bindings binding
             ON binding.tenant_id = governed.tenant_id
            AND binding.workspace_id = governed.workspace_id
            AND binding.principal_type = governed.principal_type
            AND binding.principal_id = governed.principal_id::text
          WHERE binding.principal_id IS NULL`,
        `${table}_principal_binding_mismatch_count`,
      );
    }
  }

  const counts = {
    tenantRegistryTables: governedTables.length,
    orphanTenantRows,
    orphanWorkspaceRows,
    principalBindingMismatches,
  };
  if (orphanTenantRows || orphanWorkspaceRows || principalBindingMismatches) {
    throw new Error("tenant_principal_invariant_divergence");
  }
  return counts;
}

async function collectDatabaseSummary(client, registryTables) {
  const domains = {};
  for (const [key, tables] of Object.entries(DOMAIN_TABLES)) {
    const extra = key === "exchangeLedger"
      ? {
          financialChecks: FINANCIAL_INVARIANT_QUERIES.length,
          financialDivergences: Object.values(await financialInvariantCounts(client))
            .reduce((sum, value) => sum + value, 0),
        }
      : {};
    domains[key] = summarizeDomain(await collectTableMetrics(client, tables), extra);
  }
  const tenantCounts = await tenantInvariantCounts(client, registryTables);
  domains.tenantPrincipalIsolation = summarizeDomain(
    await collectTableMetrics(client, registryTables),
    tenantCounts,
  );
  return domains;
}

async function startIsolatedRedis(tempRoot, sourceRdb, database) {
  const redisRoot = path.join(tempRoot, "redis");
  await mkdir(redisRoot, { mode: 0o700 });
  const socket = path.join(redisRoot, "redis.sock");
  const pidFile = path.join(redisRoot, "redis.pid");
  const configFile = path.join(redisRoot, "redis.conf");
  await copyFile(sourceRdb, path.join(redisRoot, "dump.rdb"));
  await chmod(path.join(redisRoot, "dump.rdb"), 0o600);
  await writeFile(
    configFile,
    [
      "bind 127.0.0.1",
      "protected-mode yes",
      "port 0",
      `unixsocket ${socket}`,
      "unixsocketperm 700",
      `dir ${redisRoot}`,
      "dbfilename dump.rdb",
      "appendonly no",
      "daemonize yes",
      `pidfile ${pidFile}`,
      `logfile ${path.join(redisRoot, "redis.log")}`,
      "save \"\"",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await run("redis-server", [configFile], { label: "redis_isolated_restore", timeout: 30_000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await run("redis-cli", ["-s", socket, "PING"], {
        label: "redis_isolated_readiness",
        timeout: 2_000,
      });
      const restored = await run("redis-cli", ["-s", socket, "-n", database, "DBSIZE"], {
        label: "redis_isolated_dbsize",
        timeout: 10_000,
      });
      return {
        socket,
        keyCount: parseSafeCount(restored.stdout.trim(), "redis_restored_key_count"),
      };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("redis_isolated_restore_not_ready");
}

async function stopIsolatedRedis(socket) {
  await run("redis-cli", ["-s", socket, "SHUTDOWN", "NOSAVE"], {
    label: "redis_isolated_shutdown",
    timeout: 10_000,
  });
}

async function resolveIsolatedPostgresBinaries() {
  const candidateDirectories = [];
  try {
    const configured = (await run("pg_config", ["--bindir"], {
      label: "postgres_isolated_bindir_discovery",
      timeout: 10_000,
    })).stdout.trim();
    if (configured) candidateDirectories.push(configured);
  } catch {
    // Debian/Ubuntu client-only PATHs do not always expose pg_config.
  }
  try {
    const versions = await readdir("/usr/lib/postgresql", { withFileTypes: true });
    for (const version of versions) {
      if (version.isDirectory() && /^\d+(?:\.\d+)?$/u.test(version.name)) {
        candidateDirectories.push(path.join("/usr/lib/postgresql", version.name, "bin"));
      }
    }
  } catch {
    // The explicit fail-closed error below covers hosts without server binaries.
  }

  for (const requestedDirectory of [...new Set(candidateDirectories)]) {
    try {
      if (!path.isAbsolute(requestedDirectory)) continue;
      const directory = await realpath(requestedDirectory);
      if (!directory.startsWith("/usr/lib/postgresql/")) continue;
      const binaries = Object.fromEntries(
        ["initdb", "pg_ctl", "createdb", "pg_restore"].map((name) => [
          name === "pg_ctl" ? "pgCtl" : name === "pg_restore" ? "pgRestore" : name,
          path.join(directory, name),
        ]),
      );
      for (const [name, binary] of Object.entries(binaries)) {
        await access(binary, fsConstants.X_OK);
        await run(binary, ["--version"], {
          label: `postgres_isolated_${name}_preflight`,
          timeout: 10_000,
        });
      }
      return binaries;
    } catch {
      // Try the next installed PostgreSQL major version.
    }
  }
  throw new Error("postgres_isolated_runtime_unavailable");
}

async function startIsolatedPostgres(tempRoot, binaries) {
  const postgresRoot = path.join(tempRoot, "postgres");
  const dataDirectory = path.join(postgresRoot, "data");
  const socketDirectory = path.join(postgresRoot, "socket");
  const logFile = path.join(postgresRoot, "postgres.log");
  const user = "tecpey_recovery_admin";
  const port = randomInt(20_000, 60_000);
  await mkdir(postgresRoot, { mode: 0o700 });
  await mkdir(socketDirectory, { mode: 0o700 });
  await run(
    binaries.initdb,
    [
      `--pgdata=${dataDirectory}`,
      `--username=${user}`,
      "--encoding=UTF8",
      "--locale=C",
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-instructions",
    ],
    { label: "postgres_isolated_initdb", timeout: 120_000 },
  );
  await appendFile(
    path.join(dataDirectory, "postgresql.conf"),
    [
      "",
      "# TecPey NOG-05 isolated restore target",
      "listen_addresses = ''",
      `unix_socket_directories = '${socketDirectory}'`,
      `port = ${port}`,
      "fsync = off",
      "synchronous_commit = off",
      "full_page_writes = off",
      "",
    ].join("\n"),
  );
  await run(
    binaries.pgCtl,
    ["-D", dataDirectory, "-l", logFile, "-w", "-t", "60", "start"],
    { label: "postgres_isolated_start", timeout: 90_000 },
  );
  const isolatedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("PG")),
  );
  return {
    dataDirectory,
    env: {
      ...isolatedEnvironment,
      PGHOST: socketDirectory,
      PGPORT: String(port),
      PGUSER: user,
      PGDATABASE: "postgres",
      PGSSLMODE: "disable",
      PGCONNECT_TIMEOUT: "10",
    },
    port,
    socketDirectory,
    user,
  };
}

async function stopIsolatedPostgres(isolatedPostgres, binaries) {
  await run(
    binaries.pgCtl,
    ["-D", isolatedPostgres.dataDirectory, "-w", "-t", "30", "-m", "fast", "stop"],
    { label: "postgres_isolated_shutdown", timeout: 60_000 },
  );
}

async function governedEvidenceDirectory(authorityDir, requestedDirectory) {
  const authorityRoot = await realpath(authorityDir);
  const artifactsRequested = path.join(authorityRoot, "artifacts");
  await mkdir(artifactsRequested, { recursive: true, mode: 0o700 });
  const artifactsRoot = await realpath(artifactsRequested);
  const evidenceRequested = path.resolve(requestedDirectory);
  if (!evidenceRequested.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("evidence_directory_outside_artifacts");
  }
  await mkdir(evidenceRequested, { recursive: true, mode: 0o700 });
  const evidenceReal = await realpath(evidenceRequested);
  if (!evidenceReal.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("evidence_directory_symlink_escape");
  }
  return evidenceReal;
}

async function main() {
  const authorityDir = path.resolve(requireEnvironment("TECPEY_RECOVERY_AUTHORITY_DIR"));
  const candidateDir = path.resolve(requireEnvironment("TECPEY_RECOVERY_CANDIDATE_DIR"));
  const environmentFile = path.resolve(requireEnvironment("TECPEY_RECOVERY_ENV_FILE"));
  const sourceSha = requireEnvironment("TECPEY_RECOVERY_SOURCE_SHA", COMMIT_SHA);
  const healthUrl = requireEnvironment("TECPEY_RECOVERY_HEALTH_URL", /^http:\/\/127\.0\.0\.1(?::[0-9]+)?\//u);
  const operatorIdentity = requireEnvironment("TECPEY_RECOVERY_OPERATOR");
  const reviewerIdentity = requireEnvironment("TECPEY_RECOVERY_REVIEWER");
  if (operatorIdentity === reviewerIdentity) throw new Error("reviewer_must_be_independent");
  if (process.env.TECPEY_RECOVERY_INDEPENDENT_REVIEW_CONFIRMED !== "1") {
    throw new Error("independent_review_not_confirmed");
  }
  const maximumRtoSeconds = Number(process.env.TECPEY_RECOVERY_MAX_RTO_SECONDS ?? "900");
  if (!Number.isInteger(maximumRtoSeconds) || maximumRtoSeconds <= 0 || maximumRtoSeconds > 900) {
    throw new Error("maximum_rto_seconds_invalid");
  }

  for (const directory of [authorityDir, candidateDir]) {
    if (!(await stat(directory)).isDirectory()) throw new Error("checkout_directory_invalid");
  }
  await access(environmentFile, fsConstants.R_OK);
  const environmentFileStat = await lstat(environmentFile);
  if (
    environmentFileStat.isSymbolicLink()
    || !environmentFileStat.isFile()
    || environmentFileStat.size < 1
    || environmentFileStat.size > 64 * 1024
    || (environmentFileStat.mode & 0o022) !== 0
  ) {
    throw new Error("environment_file_unsafe");
  }
  const candidateHead = (await run("git", ["-C", candidateDir, "rev-parse", "HEAD"], {
    label: "candidate_head",
  })).stdout.trim();
  if (candidateHead !== sourceSha) throw new Error("candidate_head_mismatch");
  const candidateStatus = (await run(
    "git",
    ["-C", candidateDir, "status", "--porcelain", "--untracked-files=no"],
    { label: "candidate_status" },
  )).stdout.trim();
  if (candidateStatus) throw new Error("candidate_checkout_not_clean");

  const healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  if (!healthResponse.ok) throw new Error("protected_staging_health_unavailable");
  const health = await healthResponse.json();
  if (
    health?.ok !== true
    || health?.build?.commit !== sourceSha
    || health?.migrations?.status !== "current"
    || !SHA256.test(health?.migrations?.planHash ?? "")
  ) {
    throw new Error("protected_staging_runtime_identity_invalid");
  }

  const imageEvidence = JSON.parse(await readFile(
    path.join(authorityDir, "docs/launch/generated/runtime-image-digest-evidence-20260812.json"),
    "utf8",
  ));
  const imageDigest = imageEvidence?.containerImage?.imageDigest;
  if (
    imageEvidence?.releaseCandidate?.sha !== sourceSha
    || imageEvidence?.workflowEvidence?.workflowSha !== sourceSha
    || !IMAGE_DIGEST.test(imageDigest ?? "")
    || imageEvidence?.signatureVerification?.dockerManifestDigest !== imageDigest
  ) {
    throw new Error("runtime_image_digest_evidence_invalid");
  }

  const registry = JSON.parse(await readFile(
    path.join(candidateDir, "docs/security/tenant-scoped-table-registry.json"),
    "utf8",
  ));
  const registryTables = registry?.tables?.map((entry) => entry.table);
  if (!Array.isArray(registryTables) || registryTables.length === 0) {
    throw new Error("tenant_registry_invalid");
  }

  const envFileValues = parseEnvironmentFile(await readFile(environmentFile, "utf8"));
  const databaseUrl = process.env.DATABASE_URL || envFileValues.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL || envFileValues.REDIS_URL;
  const extraCaPath = process.env.NODE_EXTRA_CA_CERTS || envFileValues.NODE_EXTRA_CA_CERTS;
  if (!databaseUrl) throw new Error("database_url_missing");
  if (!redisUrl) throw new Error("redis_url_missing");
  if (extraCaPath) await access(extraCaPath, fsConstants.R_OK);

  await Promise.all([
    requireExecutable("pg_dump"),
    requireExecutable("pg_restore"),
    requireExecutable("redis-cli"),
    requireExecutable("redis-server"),
  ]);
  const isolatedPostgresBinaries = await resolveIsolatedPostgresBinaries();

  const requireFromCandidate = createRequire(path.join(candidateDir, "package.json"));
  const { Client } = requireFromCandidate("pg");
  if (typeof Client !== "function") throw new Error("candidate_pg_runtime_invalid");

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tecpey-nog05-"));
  await chmod(tempRoot, 0o700);
  const postgresDump = path.join(tempRoot, "postgres.dump");
  const redisRdb = path.join(tempRoot, "redis.rdb");
  const postgresEnv = postgresEnvironment(databaseUrl, extraCaPath);
  const redisSource = redisCommand(redisUrl, extraCaPath, ["--rdb", redisRdb]);
  const redisDatabase = redisSource.database;
  const restoredDatabase = `tecpey_recovery_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  let sourceClient;
  let restoredClient;
  let sourceTransactionOpen = false;
  let isolatedPostgres;
  let isolatedRedisSocket;
  let cleanupComplete = false;

  try {
    const backupStartedAt = new Date().toISOString();
    const redisCountBefore = await redisSourceCount(redisUrl, extraCaPath);
    await run("redis-cli", redisSource.args, {
      env: redisSource.env,
      label: "redis_rdb_backup",
      timeout: 300_000,
    });
    await chmod(redisRdb, 0o600);
    const redisCountAfter = await redisSourceCount(redisUrl, extraCaPath);
    if (redisCountBefore !== redisCountAfter) throw new Error("redis_backup_boundary_changed");

    sourceClient = new Client({ connectionString: databaseUrl, statement_timeout: 120_000, query_timeout: 120_000 });
    await sourceClient.connect();
    await sourceClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    sourceTransactionOpen = true;
    const snapshotResult = await sourceClient.query("SELECT pg_export_snapshot() AS snapshot");
    const snapshot = snapshotResult.rows[0]?.snapshot;
    if (typeof snapshot !== "string" || snapshot.length < 3) throw new Error("postgres_snapshot_export_failed");
    const sourcePlanHash = await migrationState(sourceClient);
    if (sourcePlanHash !== health.migrations.planHash) throw new Error("runtime_migration_plan_hash_mismatch");
    const sourceDomains = await collectDatabaseSummary(sourceClient, registryTables);
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot}`, `--file=${postgresDump}`], {
      env: postgresEnv,
      label: "postgres_snapshot_backup",
      timeout: 600_000,
    });
    await chmod(postgresDump, 0o600);
    await sourceClient.query("COMMIT");
    sourceTransactionOpen = false;
    await sourceClient.end();
    sourceClient = undefined;
    const backupCompletedAt = new Date().toISOString();

    const postgresDigest = await sha256File(postgresDump);
    const redisDigest = await sha256File(redisRdb);
    const backupDigest = combinedBackupDigest(postgresDigest, redisDigest);
    const boundaryId = `protected-${sourceSha.slice(0, 12)}-${backupStartedAt.replace(/[-:.]/gu, "").replace("Z", "Z")}`;

    const restoreStartedAt = new Date().toISOString();
    const restoreStartedMs = Date.now();
    isolatedPostgres = await startIsolatedPostgres(tempRoot, isolatedPostgresBinaries);
    await run(isolatedPostgresBinaries.createdb, [restoredDatabase], {
      env: isolatedPostgres.env,
      label: "postgres_isolated_database_create",
      timeout: 60_000,
    });
    await run(
      isolatedPostgresBinaries.pgRestore,
      ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", restoredDatabase, postgresDump],
      { env: isolatedPostgres.env, label: "postgres_isolated_restore", timeout: 600_000 },
    );
    const isolatedRedis = await startIsolatedRedis(tempRoot, redisRdb, redisDatabase);
    isolatedRedisSocket = isolatedRedis.socket;
    if (isolatedRedis.keyCount !== redisCountAfter) throw new Error("redis_source_restore_mismatch");

    restoredClient = new Client({
      host: isolatedPostgres.socketDirectory,
      port: isolatedPostgres.port,
      user: isolatedPostgres.user,
      database: restoredDatabase,
      ssl: false,
      statement_timeout: 120_000,
      query_timeout: 120_000,
    });
    await restoredClient.connect();
    await restoredClient.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const restoredPlanHash = await migrationState(restoredClient);
    if (restoredPlanHash !== sourcePlanHash) throw new Error("postgres_restored_plan_hash_mismatch");
    const restoredDomains = await collectDatabaseSummary(restoredClient, registryTables);
    await restoredClient.query("COMMIT");
    await restoredClient.end();
    restoredClient = undefined;
    for (const key of Object.keys(DOMAIN_NAMES)) {
      assertSummariesMatch(sourceDomains[key], restoredDomains[key], key);
    }
    const restoreCompletedAt = new Date().toISOString();
    const measuredRtoSeconds = Math.ceil((Date.now() - restoreStartedMs) / 1000);
    if (measuredRtoSeconds > maximumRtoSeconds) throw new Error("protected_restore_rto_exceeded");

    await stopIsolatedRedis(isolatedRedisSocket);
    isolatedRedisSocket = undefined;
    await stopIsolatedPostgres(isolatedPostgres, isolatedPostgresBinaries);
    isolatedPostgres = undefined;
    await rm(tempRoot, { recursive: true, force: true });
    cleanupComplete = true;

    const operator = { role: "Release Operator", externalIdentity: operatorIdentity };
    const reviewer = { role: "Independent SRE Reviewer", externalIdentity: reviewerIdentity };
    const domains = Object.fromEntries(
      Object.entries(DOMAIN_NAMES).map(([key, domain]) => [key, {
        domain,
        sourceSha,
        migrationPlanHash: sourcePlanHash,
        backupBoundary: boundaryId,
        queryDigest: sourceDomains[key].queryDigest,
        rowCounts: sourceDomains[key].rowCounts,
        startedAt: backupStartedAt,
        completedAt: restoreCompletedAt,
        operator: operatorIdentity,
        reviewer: reviewerIdentity,
        disposition: "accepted",
      }]),
    );
    const evidence = {
      schemaVersion: 1,
      authority: "tecpey-protected-recovery-reconciliation-v1",
      evidenceClass: "protected-staging-domain-recovery-reconciliation",
      environment: "protected-staging",
      sourceSha,
      imageDigest,
      migrationPlanHash: sourcePlanHash,
      backupBoundary: {
        boundaryId,
        startedAt: backupStartedAt,
        completedAt: backupCompletedAt,
        rpoBoundary: "all-acknowledged-domain-state-before-backup-is-present-after-restore",
        backupDigest,
      },
      restoreWindow: {
        startedAt: restoreStartedAt,
        completedAt: restoreCompletedAt,
        measuredRtoSeconds,
        maximumRtoSeconds,
      },
      operator,
      reviewer,
      domains,
      privacyBoundary: [
        "counts-and-hashes-only",
        "no-raw-rows",
        "no-secrets-or-connection-urls",
      ],
      finalDisposition: "accepted",
    };
    verifyProtectedRecoveryReconciliationEvidence(evidence, sourceSha);

    const requestedEvidenceDirectory = process.env.TECPEY_RECOVERY_EVIDENCE_DIR
      || path.join(authorityDir, "artifacts", "protected-staging-recovery");
    const evidenceDirectory = await governedEvidenceDirectory(authorityDir, requestedEvidenceDirectory);
    const evidenceFile = path.join(evidenceDirectory, `protected-staging-recovery-reconciliation-${sourceSha}.json`);
    const temporaryEvidenceFile = `${evidenceFile}.tmp`;
    await writeFile(temporaryEvidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryEvidenceFile, evidenceFile);
    const evidenceDigest = await sha256File(evidenceFile);
    await writeFile(
      path.join(evidenceDirectory, "SHA256SUMS"),
      `${evidenceDigest}  ${path.basename(evidenceFile)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(`Protected staging recovery reconciliation evidence collected for ${sourceSha}.\n`);
  } finally {
    if (!cleanupComplete) {
      if (sourceClient) {
        if (sourceTransactionOpen) await sourceClient.query("ROLLBACK").catch(() => {});
        await sourceClient.end().catch(() => {});
      }
      if (restoredClient) await restoredClient.end().catch(() => {});
      if (isolatedRedisSocket) await stopIsolatedRedis(isolatedRedisSocket).catch(() => {});
      if (isolatedPostgres) {
        await stopIsolatedPostgres(isolatedPostgres, isolatedPostgresBinaries).catch(() => {});
      }
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
