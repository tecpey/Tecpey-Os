import { existsSync, readFileSync } from 'node:fs';

const required = [
  'src/lib/offline-sync.ts',
  'src/app/api/offline-sync/route.ts',
  'src/components/offline/OfflineSyncManager.tsx',
  'src/app/academy/offline-ready/page.tsx',
  'public/sw.js',
  'public/site.webmanifest',
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length) {
  console.error('Missing offline core files:', missing.join(', '));
  process.exit(1);
}

const route = readFileSync('src/app/api/offline-sync/route.ts', 'utf8');
const lib = readFileSync('src/lib/offline-sync.ts', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');

const checks = [
  ['server-only events rejected', lib.includes('server_event_only')],
  ['auth required for sync', route.includes('academy_profile_required')],
  ['batch cap exists', route.includes('slice(0, 50)')],
  ['payload cap exists', route.includes('80_000')],
  ['service worker skips api', sw.includes("/api/")],
  ['service worker has fallback', sw.includes('/academy/offline-ready')],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('Offline QA failed:', failed.join(', '));
  process.exit(1);
}
console.log('Offline core QA passed.');
