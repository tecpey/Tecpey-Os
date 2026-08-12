import path from "node:path";

const GENERATED_PATHS = new Set([
  "docs/internal-qa/QA_STATIC_PRODUCTION_REPORT.json",
  "docs/security/generated/api-security-manifest.json",
  "docs/security/generated/tenant-principal-isolation-inventory.json",
  "package-lock.json",
  "tests/e2e/package-lock.json",
]);

const VENDORED_PREFIXES = [
  "public/charting_library/",
  "public/datafeeds/",
];

const PLATFORM_CORE_PATHS = new Set([
  "src/lib/feature-flags.ts",
  "src/lib/platform-config.ts",
  "src/lib/platform-types.ts",
  "src/lib/product-registry.ts",
]);

const REVIEW_EVIDENCE_PATHS = [
  "docs/audits/evidence/batch-01a-audit-authority.json",
  "docs/audits/evidence/batch-01b-operational-workflows.json",
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
    domain: "repository-supply-chain",
    riskTier: "P1",
    reviewBatch: 1,
    patterns: [
      /^scripts\/audit-repository-hygiene\.mjs$/,
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
      /^src\/lib\/trading\//,
      /^src\/helper\/spot\//,
      /^src\/services\/swap\.services\.ts$/,
      /^src\/utils\/handleDecimal\.ts$/,
    ],
  },
  {
    domain: "authentication-admin-security",
    riskTier: "P1",
    reviewBatch: 3,
    patterns: [
      /(?:^|\/)(?:auth|session|csrf|webauthn|passkey|two-factor|2fa|admin|rbac|abac|tenant|principal|security|risk|audit)(?:[./_-]|$)/i,
      /^src\/lib\/compliance\//,
      /^src\/lib\/(?:api-error|api-validation|permission|rate-limit|request-route-context|route-guards|unified-session)\.ts$/,
      /^src\/lib\/production-connection-env\.ts$/,
      /^src\/proxy\.ts$/,
      /^config\/api-security-(?:exceptions|operation-overrides)\.json$/,
      /^config\/secret-scanning-baseline\.json$/,
      /^SECURITY\.md$/,
    ],
  },
  {
    domain: "database-persistence",
    riskTier: "P1",
    reviewBatch: 2,
    patterns: [
      /^migrations\//,
      /(?:^|\/)(?:database|postgres|redis|bullmq|migration|persistence|outbox)(?:[./_-]|$)/i,
      /^src\/(?:.+\/)?(?:repository|repositories)(?:[./_-]|$)/i,
      /^src\/lib\/db(?:[./_-]|$)/i,
      /^src\/lib\/news-materialization-persistence\.ts$/,
      /^src\/lib\/offline-sync(?:[./_-]|$)/i,
    ],
  },
  {
    domain: "academy",
    riskTier: "P2",
    reviewBatch: 4,
    patterns: [
      /(?:^|\/)(?:academy|lesson|assessment|certificate|curriculum|quiz|flashcard)(?:[./_-]|$)/i,
      /^src\/data\/academy/i,
      /^src\/lib\/(?:learning-os|phase5-achievement-engine|spaced-repetition|student-cartax)\.ts$/,
    ],
  },
  {
    domain: "trading-arena",
    riskTier: "P2",
    reviewBatch: 5,
    patterns: [
      /(?:^|\/)(?:trading-arena|arena|virtual-trading|trading-journal)(?:[./_-]|$)/i,
      /^src\/lib\/(?:behavioral-client|behavioral-context-server|behavioral-engine|trading-dna|trading-scenarios)\.ts$/,
    ],
  },
  {
    domain: "mentor-ai",
    riskTier: "P2",
    reviewBatch: 8,
    patterns: [
      /(?:^|\/)(?:mentor|ai|model-provider|prompt)(?:[./_-]|$)/i,
      /^src\/lib\/(?:coaching-engine|knowledge-graph|smart-review)\.ts$/,
    ],
  },
  {
    domain: "crm-notifications-community",
    riskTier: "P2",
    reviewBatch: 9,
    patterns: [
      /(?:^|\/)(?:crm|notification|community|social|reputation|journal-challenge|lead)(?:[./_-]|$)/i,
      /^src\/lib\/email\.ts$/,
      /^src\/lib\/notifications\//,
      /^src\/services\/profile\.ts$/,
    ],
  },
  {
    domain: "product-ui",
    riskTier: "P2",
    reviewBatch: 10,
    patterns: [
      /^src\/lib\/(?:coin-growth-automation|coin-visual-assets|content-growth|landing-growth|landing-growth-authority|news-automation|news-detail-pages|news-impact-history|news-impact-history-authority|news-intelligence-graph|news-materialization|news-provider-readiness|tool-growth-automation|trading-tools-growth)\.ts$/,
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
      /^src\/lib\/ops\//,
      /^src\/lib\/(?:alerts|error-tracking|event-bus|logger|metrics|observe|socket|trace)\.ts$/,
      /^src\/lib\/news-materialization-worker\.ts$/,
      /^src\/lib\/ws\//,
      /^server\.ts$/,
      /^VERIFY_PRODUCTION\.sh$/,
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

  if (
    normalized.startsWith("src/app/") ||
    normalized.startsWith("src/components/") ||
    normalized.startsWith("src/data/") ||
    normalized.startsWith("src/hooks/") ||
    normalized.startsWith("src/i18n/") ||
    normalized.startsWith("src/services/") ||
    normalized.startsWith("src/utils/") ||
    normalized.startsWith("public/") ||
    /^src\/lib\/(?:api|entity|i18n-locale|locale|seo)\.ts$/.test(normalized) ||
    normalized.startsWith("src/types/")
  ) {
    return {
      domain: "product-ui",
      riskTier: "P2",
      reviewBatch: 10,
      classificationRule: "product-ui-prefix",
    };
  }

  if (PLATFORM_CORE_PATHS.has(normalized)) {
    return {
      domain: "platform-core",
      riskTier: "P1",
      reviewBatch: 1,
      classificationRule: "platform-core-explicit",
    };
  }

  if (normalized.startsWith("src/")) {
    throw new Error(`Source path has no explicit audit domain policy: ${normalized}`);
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
  version: 13,
  generatedPaths: [...GENERATED_PATHS].sort(),
  platformCorePaths: [...PLATFORM_CORE_PATHS].sort(),
  reviewEvidencePaths: [...REVIEW_EVIDENCE_PATHS],
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
