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
  'TECPEY_NOTIFICATION_DEFAULT_CHANNELS',
  'TECPEY_PUSH_PROVIDER',
  'TECPEY_ANDROID_PACKAGE',
  'TECPEY_IOS_BUNDLE_ID',
  'TECPEY_FCM_SERVER_KEY',
  'TECPEY_APNS_KEY_ID',
  'TECPEY_APNS_TEAM_ID',
  'TECPEY_APNS_BUNDLE_ID',
  'TECPEY_APNS_PRIVATE_KEY',
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

for (const key of [
  'TECPEY_SESSION_SECRET',
  'TECPEY_REFRESH_SECRET',
  'TECPEY_ACADEMY_AUTH_SECRET',
  'CERTIFICATE_SIGNING_SECRET',
]) {
  const value = process.env[key] || '';
  if (value && value.length < 32) errors.push(`${key} must be at least 32 characters`);
}

const authSecrets = [
  ['TECPEY_SESSION_SECRET', process.env.TECPEY_SESSION_SECRET],
  ['TECPEY_REFRESH_SECRET', process.env.TECPEY_REFRESH_SECRET],
  ['TECPEY_ACADEMY_AUTH_SECRET', process.env.TECPEY_ACADEMY_AUTH_SECRET],
].filter(([, value]) => Boolean(value));
for (let i = 0; i < authSecrets.length; i += 1) {
  for (let j = i + 1; j < authSecrets.length; j += 1) {
    if (authSecrets[i][1] === authSecrets[j][1]) {
      errors.push(`${authSecrets[i][0]} and ${authSecrets[j][0]} must be distinct`);
    }
  }
}

for (const key of optional) {
  const value = process.env[key];
  if (value && badTokens.some((token) => value.includes(token))) {
    errors.push(`${key} still contains a placeholder`);
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

if (process.env.NODE_ENV === 'production' && process.env.TECPEY_ALLOW_MEMORY_RATE_LIMIT !== '1') {
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

if (errors.length) {
  console.error('TecPey environment validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('TecPey environment validation passed.');
