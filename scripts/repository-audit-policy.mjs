import path from "node:path";

const GENERATED_PATHS = new Set([
  "package-lock.json",
  "tests/e2e/package-lock.json",
]);

const VENDORED_PREFIXES = [
  "public/charting_library/",
  "public/datafeeds/",
];

const DOMAIN_RULES = [
  {
    domain: "tests-quality-evidence",
    riskTier: "P2",
    reviewBatch: 12,
    patterns: [
      /^src\/tests\//,
      /^tests\//,
      /\.(?:test|spec|integration)\.[cm]?[jt]sx?$/i,
      /^docs\//,
    ],
  },
  {
    domain: "wallet-custody",
    riskTier: "P0",
    reviewBatch: 7,
    patterns: [
      /(?:^|\/)(?:wallet|withdrawal|withdrawals|custody|keystore|hot-wallet|cold-wallet|utxo|nonce)(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "exchange-ledger",
    riskTier: "P0",
    reviewBatch: 6,
    patterns: [
      /(?:^|\/)(?:exchange|orderbook|orders?|trades?|fills?|matching|ledger|financial|balances?|fees?)(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "authentication-admin-security",
    riskTier: "P1",
    reviewBatch: 3,
    patterns: [
      /(?:^|\/)(?:auth|session|csrf|webauthn|passkey|two-factor|2fa|admin|rbac|abac|tenant|principal|security|risk|audit)(?:[./_-]|$)/i,
      /^SECURITY\.md$/,
    ],
  },
  {
    domain: "database-persistence",
    riskTier: "P1",
    reviewBatch: 2,
    patterns: [
      /^migrations\//,
      /(?:^|\/)(?:database|postgres|redis|bullmq|migration|persistence|repository|outbox)(?:[./_-]|$)/i,
      /^src\/lib\/db(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "academy",
    riskTier: "P2",
    reviewBatch: 4,
    patterns: [/(?:^|\/)(?:academy|lesson|assessment|certificate|curriculum|quiz|flashcard)(?:[./_-]|$)/i],
  },
  {
    domain: "trading-arena",
    riskTier: "P2",
    reviewBatch: 5,
    patterns: [/(?:^|\/)(?:trading-arena|arena|virtual-trading|trading-journal)(?:[./_-]|$)/i],
  },
  {
    domain: "mentor-ai",
    riskTier: "P2",
    reviewBatch: 8,
    patterns: [/(?:^|\/)(?:mentor|ai|model-provider|prompt)(?:[./_-]|$)/i],
  },
  {
    domain: "crm-notifications-community",
    riskTier: "P2",
    reviewBatch: 9,
    patterns: [
      /(?:^|\/)(?:crm|notification|community|social|reputation|journal-challenge|lead)(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "operations-runtime",
    riskTier: "P1",
    reviewBatch: 11,
    patterns: [
      /^deploy\//,
      /^docker-compose\.production\.yml$/,
      /^Dockerfile$/,
      /^ecosystem\.config\./,
      /(?:^|\/)(?:operations|deployment|runtime|bootstrap|readiness|health|recovery|backup|restore|observability)(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "repository-supply-chain",
    riskTier: "P1",
    reviewBatch: 1,
    patterns: [
      /^\.github\//,
      /^scripts\//,
      /^(?:package(?:-lock)?\.json|tsconfig\.json|eslint\.config\.[cm]?js|next\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js)$/,
      /^(?:AGENTS|CLAUDE|CONTRIBUTING|CODE_OF_CONDUCT|LICENSE|CHANGELOG)\b/i,
    ],
  },
];

function normalizePath(repositoryPath) {
  if (typeof repositoryPath !== "string" || repositoryPath.length === 0) {
    throw new TypeError("repositoryPath must be a non-empty string");
  }
  if (repositoryPath.includes("\\") || repositoryPath.startsWith("/") || repositoryPath.includes("\0")) {
    throw new Error(`repositoryPath is not canonical: ${JSON.stringify(repositoryPath)}`);
  }
  return repositoryPath;
}

export function classifyProvenance(repositoryPath) {
  const normalized = normalizePath(repositoryPath);
  if (GENERATED_PATHS.has(normalized)) return "generated";
  if (VENDORED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return "vendored";
  return "source";
}

export function classifyDomain(repositoryPath) {
  const normalized = normalizePath(repositoryPath);
  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        domain: rule.domain,
        riskTier: rule.riskTier,
        reviewBatch: rule.reviewBatch,
        classificationRule: rule.domain,
      };
    }
  }

  if (normalized.startsWith("src/app/") || normalized.startsWith("src/components/") || normalized.startsWith("public/")) {
    return {
      domain: "product-ui",
      riskTier: "P2",
      reviewBatch: 10,
      classificationRule: "product-ui-prefix",
    };
  }

  if (normalized.startsWith("src/")) {
    return {
      domain: "platform-core",
      riskTier: "P1",
      reviewBatch: 1,
      classificationRule: "platform-core-prefix",
    };
  }

  return {
    domain: "repository-governance",
    riskTier: "P3",
    reviewBatch: 1,
    classificationRule: "repository-root",
  };
}

export function fileTypeForPath(repositoryPath, gitMode) {
  const normalized = normalizePath(repositoryPath);
  if (gitMode === "120000") return "symlink";
  if (gitMode === "160000") return "gitlink";
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(basename).toLowerCase();
  if (extension) return extension.slice(1);
  if (basename.startsWith(".")) return "dotfile";
  return "no-extension";
}

export function initialReviewStatus({ contentKind, provenance }) {
  if (contentKind === "text" && provenance === "source") return "semantic-review-pending";
  return "ownership-review-pending";
}

export const repositoryAuditPolicy = Object.freeze({
  version: 1,
  generatedPaths: [...GENERATED_PATHS].sort(),
  vendoredPrefixes: [...VENDORED_PREFIXES].sort(),
  reviewBatches: Object.freeze({
    1: "Root, CI, supply chain and runtime bootstrap",
    2: "Database schema, migrations and persistence infrastructure",
    3: "Authentication, authorization, tenant and admin security",
    4: "Academy and educational integrity",
    5: "Trading Arena and behavioral evidence",
    6: "Exchange, ledger and financial precision",
    7: "Wallet, withdrawal and custody",
    8: "Mentor AI, memory and provider governance",
    9: "CRM, notifications, social and privacy",
    10: "UI/UX, bilingual parity, accessibility and performance",
    11: "Operations, deployment, observability and recovery",
    12: "Tests, documentation, dead-code/provenance and reconciliation",
  }),
});
