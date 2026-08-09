const REQUIRED_PUBLIC_BOUNDARIES = [
  {
    file: "README.md",
    tokens: [
      "not evidence that real-money Exchange, custody, deposits, or withdrawals are active",
      "Real-money Exchange, custody, deposits, withdrawals, public financial rewards, enterprise and white-label activation remain outside the current launch scope",
      "Repository presence of a capability does not imply production activation",
    ],
  },
  {
    file: "README.fa.md",
    tokens: [
      "شاهدی بر فعال‌بودنِ صرافیِ پول‌واقعی، کاستدی، واریز یا برداشت نیست",
      "صرافیِ پول‌واقعی، کاستدی، واریز، برداشت، پاداش‌های مالیِ عمومی، enterprise و white-label خارج از scope فعلی‌اند",
      "حضورِ یک قابلیت در مخزن به‌معنیِ فعال‌سازیِ پروداکشن نیست",
    ],
  },
  {
    file: "src/app/layout.tsx",
    tokens: [
      "TecPey Exchange Core — launch gated",
      "هسته صرافی تک‌پی — غیرفعال تا تکمیل گیت‌های راه‌اندازی",
      "Real-money exchange and custody capabilities remain launch-gated",
    ],
  },
  {
    file: "src/app/en/page.tsx",
    tokens: [
      "Crypto Education and Launch-Gated Market Practice",
      "real-money exchange, custody, deposits and withdrawals remain launch-gated",
      "virtual trading practice",
    ],
  },
  {
    file: "src/app/en/EnglishLandingClient.tsx",
    tokens: [
      "no real money involved",
      "no real money, real profit or real trade takes place in it",
      "it does not sell buy or sell signals",
    ],
  },
  {
    file: "src/components/seo/StructuredData.tsx",
    tokens: [
      '"@type": ["Organization", "EducationalOrganization"]',
      "Real-money exchange, custody, deposits and withdrawals remain launch-gated",
      "Virtual Trading Practice",
    ],
  },
  {
    file: "src/components/academy/AcademySimulationWorld.tsx",
    tokens: ["Practice wallet", "Virtual balance for practice, not real money"],
  },
];

const REQUIRED_ACTIVATION_BOUNDARIES = [
  {
    file: "src/lib/wallet/custody-launch-policy.ts",
    tokens: [
      "productionReady: false",
      "real_withdrawals_forbidden",
      "environment_private_keys_forbidden",
      "simulation_forbidden",
      "TECPEY_CUSTODY_KILL_SWITCH",
    ],
  },
  {
    file: "scripts/validate-env.mjs",
    tokens: [
      "Environment-backed wallet private keys are forbidden in production",
      "HSM/MPC custody configuration is forbidden until an approved signer is implemented",
      "TECPEY_REAL_WITHDRAWALS_ENABLED=1 is forbidden",
    ],
  },
  {
    file: "server.ts",
    tokens: [
      "assertProductionCustodyConfiguration()",
      "custodyStatus.workerEnabled",
      "Custody disabled — withdrawal execution, signing and broadcast workers were not started",
    ],
  },
  {
    file: "src/app/api/wallet/custody-status/route.ts",
    tokens: ["productionReady: status.productionReady", "withdrawalsAvailable: false"],
    forbidden: ["PRIVATE_KEY", "HSM_KEY_ID", "MPC_PARTY_ID"],
  },
  {
    file: "scripts/generate-controlled-launch-release-packet.mjs",
    tokens: [
      "disabledCapabilityAttestation",
      "real-money Exchange remains NO-GO unless separately certified",
      "custody, deposits and withdrawals remain NO-GO unless separately certified",
      "public financial rewards remain NO-GO unless separately certified",
      "enterprise and white-label activation remain NO-GO unless separately certified",
    ],
  },
];

const REQUIRED_PACKAGE_SCRIPTS = [
  ["launch:disabled-capabilities:check", "node scripts/check-disabled-capability-attestation.mjs"],
  ["test:disabled-capability-attestation", "node --test scripts/disabled-capability-attestation-policy.test.mjs"],
];

const FORBIDDEN_PUBLIC_CLAIMS = [
  /\breal-money exchange is live\b/i,
  /\bexchange is live\b/i,
  /\bsecure persian crypto exchange\b/i,
  /\bsecure crypto exchange\b/i,
  /\bpersian crypto exchange platform\b/i,
  /\bfirst steps of buying and selling crypto\b/i,
  /\bstart trading\b/i,
  /\bFinancialService\b/,
  /\bcurrenciesAccepted\b/,
  /\bpaymentAccepted\b/,
  /\bBank transfer,\s*Crypto\b/i,
  /\bcustody is live\b/i,
  /\bwithdrawals are live\b/i,
  /\bwhite-label activation is approved\b/i,
  /\bready for real-money\b/i,
  /صرافی(?:\s|ِ|‌)+زنده(?:\s|ِ|‌)+در(?:\s|ِ|‌)+دسترس/,
  /برداشت(?:\s|ِ|‌)+پول(?:\s|ِ|‌)+واقعی(?:\s|ِ|‌)+فعال(?:\s|ِ|‌)+است/,
  /کاستدی(?:\s|ِ|‌)+پروداکشن(?:\s|ِ|‌)+فعال(?:\s|ِ|‌)+است/,
];

const REQUIRED_RUNTIME_PATTERNS = [
  {
    file: "server.ts",
    pattern:
      /if\s*\(\s*redisUrl\s*&&\s*custodyStatus\.workerEnabled\s*\)\s*\{[\s\S]*?withdrawalWorkers\s*=\s*await\s+import\(["']\.\/src\/workers\/withdrawal-worker["']\)[\s\S]*?withdrawalWorkers\.startWithdrawalWorkers\(\)/,
    reason: "withdrawal workers must start only inside the redisUrl plus custodyStatus.workerEnabled guard",
  },
];

function normalized(value) {
  return String(value).replace(/\s+/g, " ");
}

function sourceFor(sources, file) {
  return sources[file] ?? "";
}

function requireToken(failures, sources, file, token) {
  if (!normalized(sourceFor(sources, file)).includes(normalized(token))) {
    failures.push(`${file}: missing disabled-capability boundary: ${token}`);
  }
}

function rejectPattern(failures, sources, file, pattern) {
  if (pattern.test(sourceFor(sources, file))) {
    failures.push(`${file}: forbidden launch-readiness claim matched ${pattern}`);
  }
}

function requirePattern(failures, sources, file, pattern, reason) {
  if (!pattern.test(sourceFor(sources, file))) {
    failures.push(`${file}: missing disabled-capability runtime guard: ${reason}`);
  }
}

export function evaluateDisabledCapabilityAttestation(sources) {
  const failures = [];

  for (const contract of REQUIRED_PUBLIC_BOUNDARIES) {
    for (const token of contract.tokens) {
      requireToken(failures, sources, contract.file, token);
    }
    for (const pattern of FORBIDDEN_PUBLIC_CLAIMS) {
      rejectPattern(failures, sources, contract.file, pattern);
    }
  }

  for (const contract of REQUIRED_ACTIVATION_BOUNDARIES) {
    for (const token of contract.tokens) {
      requireToken(failures, sources, contract.file, token);
    }
    for (const forbidden of contract.forbidden ?? []) {
      if (sourceFor(sources, contract.file).includes(forbidden)) {
        failures.push(`${contract.file}: exposes forbidden custody configuration marker: ${forbidden}`);
      }
    }
  }

  for (const contract of REQUIRED_RUNTIME_PATTERNS) {
    requirePattern(failures, sources, contract.file, contract.pattern, contract.reason);
  }

  const packageJson = JSON.parse(sourceFor(sources, "package.json") || "{}");
  for (const [name, command] of REQUIRED_PACKAGE_SCRIPTS) {
    if (packageJson.scripts?.[name] !== command) {
      failures.push(`package.json: script ${name} must be exactly "${command}"`);
    }
  }
  if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run launch:disabled-capabilities:check")) {
    failures.push("package.json: launch:decision:check must enforce disabled capability attestation");
  }
  if (!packageJson.scripts?.["launch:decision:check"]?.includes("npm run test:disabled-capability-attestation")) {
    failures.push("package.json: launch:decision:check must run disabled capability attestation tests");
  }

  return failures;
}
