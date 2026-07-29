# TecPey Security Patch Final QA

Applied fixes:

- Crypto News API `limit` is clamped to 1..24.
- `/api/academy-specialized-lead` now has IP-based rate limiting.
- `/api/academy-specialized-lead` now reads raw text, rejects payloads over 5000 bytes, and validates JSON before parsing.
- User-Agent and IP hints are sanitized before JSONL write.
- `.env.example` and `.env.local.example` no longer contain `https://dan.com`.
- Example OpenAI keys are blank placeholders, not fake secrets.
- AI Mentor fallback no longer exposes `.env.local`, `OPENAI_API_KEY`, `CTRL+C`, or `npm start` instructions to users.
- Nginx config includes stronger security headers and API/general rate limit zones.
- Added `deploy/nginx/tecpey.ssl.conf` as a production HTTPS template with HSTS, CSP, redirect-to-HTTPS, and rate limits.

Local validation target:

```bash
npm install
npm run build
```

Manual security checks:

```bash
curl "http://localhost:3000/api/crypto-news?locale=fa&limit=999999"
# Should return at most 24 items.

python3 - <<'PY'
import requests
print(requests.post('http://localhost:3000/api/academy-specialized-lead', data='x'*6000).status_code)
PY
# Should return 413 when the app server is running.
```
