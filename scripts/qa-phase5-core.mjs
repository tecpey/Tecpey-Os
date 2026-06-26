import fs from 'node:fs';

const required = [
  'src/lib/phase5-achievement-engine.ts',
  'src/app/api/achievements/route.ts',
  'src/app/api/notification-brain/route.ts',
  'src/components/learning-os/AchievementCenter.tsx',
  'src/app/academy/achievements/page.tsx',
  'src/app/api/academy-certificates/route.ts',
];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error('Missing phase5 files:', missing.join(', '));
  process.exit(1);
}
const certRoute = fs.readFileSync('src/app/api/academy-certificates/route.ts','utf8');
if (!certRoute.includes('awardMilestonesAfterCertificate')) {
  console.error('Certificate milestone hook missing');
  process.exit(1);
}
const notificationCenter = fs.readFileSync('src/components/learning-os/NotificationCenter.tsx','utf8');
if (!notificationCenter.includes('/api/notification-brain')) {
  console.error('Notification brain integration missing');
  process.exit(1);
}
console.log('✅ Phase 5 certificate + achievement + notification brain QA passed.');
