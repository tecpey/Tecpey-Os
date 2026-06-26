# Security Policy

## Supported Versions

Only the latest production version of TecPey receives security updates.

| Version | Supported |
|---------|-----------|
| Latest (main) | ✅ Yes |
| Older tags | ❌ No |

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in TecPey, please report it responsibly through one of the following channels:

### Preferred: Email

Send a detailed report to:

**security@tecpey.ir** or **support@tecpey.ir**

Include in your report:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any proof-of-concept code (if applicable)
- Your contact information for follow-up

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix timeline communicated | Within 10 business days |
| Patch released | Depends on severity |

---

## Scope

### In Scope

- Authentication and session management (`/api/academy/auth/**`, `/api/admin/**`)
- CSRF protection bypass
- Authorization flaws (accessing another user's data)
- SQL injection or database exposure
- XSS in user-facing pages
- Secrets exposure via API responses
- Insecure direct object references

### Out of Scope

- Denial of service attacks
- Social engineering of TecPey staff
- Brute force attacks against rate-limited endpoints
- Vulnerabilities in third-party dependencies (report to upstream)
- Issues that require physical access to servers

---

## Security Architecture

TecPey implements the following security controls:

| Control | Implementation |
|---------|---------------|
| CSRF Protection | `verifyCsrfOrigin()` on all state-changing API routes |
| Session Management | httpOnly cookies, 15-minute admin sessions, JWT with `jose` |
| Secret Management | Fail-closed in production — missing secrets block requests |
| Password Policy | Minimum 10 characters enforced at API and UI layer |
| Authentication | JWT with single-purpose secrets per auth domain |
| Input Validation | Server-side validation on all user inputs |
| Database | Parameterized queries, no raw SQL string concatenation |
| Headers | Security headers via Nginx reverse proxy |

---

## Responsible Disclosure

We appreciate responsible disclosure. If you report a valid security issue:

- We will work with you to understand and fix the issue
- We will credit you in the release notes (if you wish)
- We ask that you give us reasonable time to patch before public disclosure

We do not offer a bug bounty program at this time, but we genuinely appreciate the security community's help in keeping TecPey and its users safe.

---

## Contact

| Channel | Details |
|---------|---------|
| Security Email | support@tecpey.ir |
| General | info@tecpey.ir |
| Telegram | [@tecpeyco](https://t.me/tecpeyco) |
