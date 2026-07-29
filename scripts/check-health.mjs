const base = process.env.TECPEY_HEALTH_URL || 'http://127.0.0.1:3000/api/health';
const res = await fetch(base);
if (!res.ok) {
  console.error(`Health check failed: ${res.status}`);
  process.exit(1);
}
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
