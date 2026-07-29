#!/usr/bin/env node
const baseUrl = process.env.TECPEY_QA_BASE_URL || 'http://localhost:3000';
const email = `qa-${Date.now()}@tecpey.local`;
const password = 'Test123456';
const displayName = 'QA Student';
const username = `qa_${Date.now()}`;

function readSetCookies(headers) {
  const raw = headers.getSetCookie ? headers.getSetCookie() : [];
  if (raw.length) return raw.map((item) => item.split(';')[0]).join('; ');
  const single = headers.get('set-cookie');
  return single ? single.split(',').map((item) => item.split(';')[0]).join('; ') : '';
}

async function request(path, options = {}, cookie = '') {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookie ? { cookie } : {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { res, json, text, cookie: readSetCookies(res.headers) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('TecPey Academy Core QA started:', baseUrl);

let step = await request('/api/academy/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, displayName, username }),
});
assert(step.res.ok && step.json?.authenticated, `register failed: ${step.res.status} ${step.text}`);
let cookie = step.cookie;
assert(cookie.includes('tecpey_academy_auth='), 'academy auth cookie was not set');
console.log('✓ register + academy auth cookie');

step = await request('/api/academy/auth/me', {}, cookie);
assert(step.res.ok && step.json?.authenticated, `me failed: ${step.res.status} ${step.text}`);
console.log('✓ academy auth me');

step = await request('/api/academy-student-profile', {}, cookie);
assert(step.res.ok && step.json?.authenticated, `profile pre-check failed: ${step.res.status} ${step.text}`);
assert(!step.json?.profile, 'new account should not already have a profile');
console.log('✓ profile pre-check');

step = await request('/api/academy-student-profile', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ displayName, username, avatar: '🚀', learningGoal: 'یادگیری اصولی', locale: 'fa' }),
}, cookie);
assert(step.res.ok && step.json?.studentId, `profile create failed: ${step.res.status} ${step.text}`);
cookie = `${cookie}; ${step.cookie}`;
assert(cookie.includes('tecpey_student_session='), 'student session cookie was not set');
console.log('✓ profile create + student session cookie');

step = await request('/api/academy-student-profile', {}, cookie);
assert(step.res.ok && step.json?.profile?.display_name, `profile read failed: ${step.res.status} ${step.text}`);
console.log('✓ profile read after session');

console.log('TecPey Academy Core QA passed.');
