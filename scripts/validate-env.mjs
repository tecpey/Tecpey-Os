import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function parseDurationSeconds(value) {
  const raw = value?.trim();
  if (!raw) return null;
  const match = /^(\d+)(s|m|h|d)$/.exec(raw);
  if (!match) return Number.NaN;
  const amount = Number(match[1]);
  const multiplier =
    match[2] === 's'
      ? 1
      : match[2] === 'm'
        ? 60
        : match[2] === 'h'
          ? 60 * 60
          : 24 * 60 * 60;
  return Number.isSafeInteger(amount) ? amount * multiplier : Number.NaN;
}

loadEnvFile('.env.production');
loadEnvFile('.env.local');
loadEnvFile('.env');

const required = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_API_BACKEND_URL',
  'NEXT_PUBLIC_API_SOCKET_URL',
  'TECPEY_SESSION_SECRET',
  'TECPEY_REFRESH_SECRET',
  'TECPEY_ACADEMY_AUTH_SECRET',
  'CERTIFICATE_SIGNING_SECRET',
  'TECPEY_WITHDRAWAL_PRICE_SECRET',
  'TECPEY_OFFLINE_SYNC_SECRET',
  'TECPEY_CRM_PII_KEY_B64',
  'TECPEY_CRM_CONTACT_HASH_SECRET',
  'TECPEY_TRUSTED_PROXY_HEADER',
  'TECPEY_TRUSTED_PROXY_HOPS',
  'DATABASE_URL',
];

const optional = [
  'OPENAI_API_KEY',
  'AI_MENTOR_MODEL',
  'AI_MENTOR_FALLBACK_MODEL',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'TECPEY_ADMIN_TOKEN',
  'TECPEY_SESSION_MAX_AGE',
  'TECPEY_SESSION_MAX_AGE_SECONDS',
  'TECPEY_LEGACY_AUTH_UNTIL',
  'TECPEY_WITHDRAWAL_DAILY_LIMIT_USD',
  'TECPEY_REAL_WITHDRAWALS_ENABLED',
  'TECPEY_NOTIFICATION_DEFAULT_CHANNELS',
  'TECPEY_PUSH_PROVIDER',
  'TECPEY_ANDROID_PACKAGE',
  'TECPEY_IOS_BUNDLE_ID',
  'TECPEY_FCM_SERVER_KEY',
  'TECPEY_APNS_KEY_ID',
  'TECPEY_APNS_TEAM_ID',
  'TECPEY_APNS_BUNDLE_ID',
  'TECPEY_APNS_PRIVATE_KEY',
  'ACADEMY_LEADS_WEBHOOK_URL',
  'TECPEY_CRM_WEBHOOK_SECRET',
];

const badTokens = ['CHANGE_ME', 'your-real', 'admin-de', 'wss-dem', 'REPLACE_WITH'];
const errors = [];

for (const key of required) {
  const value = process.env[key];
  if (!value) errors.push(`${key} is missing`);
  if (value && badTokens.some((token) => value.includes(token))) {
    errors.push(`${key} still contains a placeholder`);
  }
}

const signingSecretNames = [
  'TECPEY_SESSION_SECRET',
  'TECPEY_REFRESH_SECRET',
  'TECPEY_ACADEMY_AUTH_SECRET',
  'CERTIFICATE_SIGNING_SECRET',
  'TECPEY_WITHDRAWAL_PRICE_SECRET',
  'TECPEY_OFFLINE_SYNC_SECRET',
  'TECPEY_CRM_PII_KEY_B64',
  'TECPEY_CRM_CONTACT_HASH_SECRET',
  'TECPEY_CRM_WEBHOOK_SECRET',
];
for (const key of signingSecretNames) {
  const value = process.env[key] || '';
  if (value && key !== 'TECPEY_CRM_PII_KEY_B64' && value.length < 32) {
    errors.push(`${key} must be at least 32 characters`);
  }
}

const crmPiiKey = process.env.TECPEY_CRM_PII_KEY_B64?.trim();
if (crmPiiKey) {
  try {
    if (Buffer.from(crmPiiKey, 'base64').length !== 32) {
      errors.push('TECPEY_CRM_PII_KEY_B64 must decode to exactly 32 bytes');
    }
  } catch {
    errors.push('TECPEY_CRM_PII_KEY_B64 must be valid base64');
  }
}

const signingSecrets = signingSecretNames
  .map((name) => [name, process.env[name]])
  .filter(([, value]) => Boolean(value));
for (let i = 0; i < signingSecrets.length; i += 1) {
  for (let j = i + 1; j < signingSecrets.length; j += 1) {
    if (signingSecrets[i][1] === signingSecrets[j][1]) {
      errors.push(`${signingSecrets[i][0]} and ${signingSecrets[j][0]} must be distinct`);
    }
  }
}

const trustedProxyHeader = process.env.TECPEY_TRUSTED_PROXY_HEADER?.trim().toLowerCase();
if (trustedProxyHeader && !['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'].includes(trustedProxyHeader)) {
  errors.push('TECPEY_TRUSTED_PROXY_HEADER must be cf-connecting-ip, x-real-ip or x-forwarded-for');
}
const trustedProxyHops = Number(process.env.TECPEY_TRUSTED_PROXY_HOPS);
if (process.env.TECPEY_TRUSTED_PROXY_HOPS && (!Number.isInteger(trustedProxyHops) || trustedProxyHops < 1 || trustedProxyHops > 10)) {
  errors.push('TECPEY_TRUSTED_PROXY_HOPS must be an integer between 1 and 10');
}

for (const key of optional) {
  const value = process.env[key];
  if (value && badTokens.some((token) => value.includes(token))) {
    errors.push(`${key} still contains a placeholder`);
  }
}

const academyWebhook = process.env.ACADEMY_LEADS_WEBHOOK_URL?.trim();
const crmWebhookSecret = process.env.TECPEY_CRM_WEBHOOK_SECRET?.trim();
if (academyWebhook) {
  try {
    const parsed = new URL(academyWebhook);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      errors.push('ACADEMY_LEADS_WEBHOOK_URL must use https in production');
    }
  } catch {
    errors.push('ACADEMY_LEADS_WEBHOOK_URL must be a valid URL');
  }
  if (!crmWebhookSecret) {
    errors.push('TECPEY_CRM_WEBHOOK_SECRET is required when ACADEMY_LEADS_WEBHOOK_URL is configured');
  }
}
if (crmWebhookSecret && !academyWebhook) {
  errors.push('ACADEMY_LEADS_WEBHOOK_URL is required when TECPEY_CRM_WEBHOOK_SECRET is configured');
}

const configuredSessionSeconds = process.env.TECPEY_SESSION_MAX_AGE_SECONDS?.trim();
const configuredSessionDuration = process.env.TECPEY_SESSION_MAX_AGE?.trim();
if (configuredSessionSeconds && configuredSessionDuration) {
  errors.push('Set only one of TECPEY_SESSION_MAX_AGE_SECONDS or TECPEY_SESSION_MAX_AGE');
}
let accessSessionLifetime = null;
if (configuredSessionSeconds) {
  accessSessionLifetime = Number(configuredSessionSeconds);
} else if (configuredSessionDuration) {
  accessSessionLifetime = parseDurationSeconds(configuredSessionDuration);
}
if (accessSessionLifetime !== null) {
  if (!Number.isFinite(accessSessionLifetime) || !Number.isInteger(accessSessionLifetime)) {
    errors.push('Access-session lifetime must be a valid integer seconds value or duration such as 30m or 4h');
  } else if (accessSessionLifetime < 5 * 60) {
    errors.push('Access-session lifetime must be at least 5 minutes');
  } else if (accessSessionLifetime > 4 * 60 * 60) {
    errors.push('Access-session lifetime may not exceed the 4-hour security ceiling');
  }
}

const withdrawalDailyLimit = process.env.TECPEY_WITHDRAWAL_DAILY_LIMIT_USD?.trim();
if (withdrawalDailyLimit) {
  const parsed = Number(withdrawalDailyLimit);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    errors.push('TECPEY_WITHDRAWAL_DAILY_LIMIT_USD must be greater than 0 and no more than 1000000');
  }
}

const legacyAuthUntil = process.env.TECPEY_LEGACY_AUTH_UNTIL?.trim();
const legacyAuthHardSunset = Date.parse('2026-08-18T00:00:00.000Z');
if (process.env.NODE_ENV === 'production' && legacyAuthUntil) {
  const cutoff = Date.parse(legacyAuthUntil);
  const now = Date.now();
  const maxLegacyWindowMs = 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(cutoff)) {
    errors.push('TECPEY_LEGACY_AUTH_UNTIL must be a valid ISO-8601 timestamp');
  } else if (now >= legacyAuthHardSunset) {
    errors.push('Legacy cookie compatibility has passed its immutable 2026-08-18 sunset and must be removed');
  } else if (cutoff <= now) {
    errors.push('TECPEY_LEGACY_AUTH_UNTIL must be in the future or removed to disable legacy auth');
  } else if (cutoff > legacyAuthHardSunset) {
    errors.push('TECPEY_LEGACY_AUTH_UNTIL may not exceed the immutable 2026-08-18 legacy auth sunset');
  } else if (cutoff - now > maxLegacyWindowMs) {
    errors.push('TECPEY_LEGACY_AUTH_UNTIL may not extend legacy cookie compatibility beyond 30 days');
  }
}

const allowedMentorModels = new Set([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5-mini',
  'gpt-5-nano',
]);
const mentorModel = process.env.AI_MENTOR_MODEL;
const mentorFallbackModel = process.env.AI_MENTOR_FALLBACK_MODEL;
if (mentorModel && !allowedMentorModels.has(mentorModel)) {
  errors.push(`AI_MENTOR_MODEL is not in the approved TecPey model allowlist: ${mentorModel}`);
}
if (mentorFallbackModel && !allowedMentorModels.has(mentorFallbackModel)) {
  errors.push(`AI_MENTOR_FALLBACK_MODEL is not in the approved TecPey model allowlist: ${mentorFallbackModel}`);
}

if (process.env.NODE_ENV === 'production') {
  if (!process.env.REDIS_URL?.trim()) {
    errors.push(
      'REDIS_URL is required in production because strict session and withdrawal risk authority use the shared ioredis client; Redis REST credentials alone are insufficient.'
    );
  }

  if (process.env.TECPEY_REAL_WITHDRAWALS_ENABLED === '1') {
    errors.push(
      'TECPEY_REAL_WITHDRAWALS_ENABLED=1 is forbidden until the custody launch gate in issue #106 is independently closed.'
    );
  }

  if (process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT !== '1') {
    const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
    const hasRedisRest = process.env.REDIS_REST_URL && process.env.REDIS_REST_TOKEN;
    if (!hasUpstash && !hasRedisRest) {
      errors.push(
        'Redis REST must be configured in production for coordinated rate limiting. ' +
        'Set UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN or REDIS_REST_URL/REDIS_REST_TOKEN, ' +
        'or set TECPEY_ALLOW_MEMORY_RATE_LIMIT=1 for single-instance deployments with per-instance limiting.'
      );
    }
  }
}

if (errors.length) {
  console.error('TecPey environment validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('TecPey environment validation passed.');
