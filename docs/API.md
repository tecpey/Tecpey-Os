# TecPey — API Reference

## Overview

All API routes live under `/api/`. They are Next.js App Router route handlers.

**Base URL:** `https://tecpey.ir/api`

---

## Authentication

Most endpoints require an active academy session cookie (`tecpey_academy_session`) set by the login flow.

Admin endpoints require either:
- The `x-tecpey-admin-token` header with the admin token, or
- The `tecpey_admin_session` cookie from a prior admin login

---

## CSRF Protection

All state-changing routes (`POST`, `PATCH`, `DELETE`) verify the `Origin` header matches `NEXT_PUBLIC_SITE_URL`.

Requests without a matching origin receive:
```json
{ "ok": false, "error": "forbidden" }
```
**Status:** `403`

---

## Academy Auth

### POST /api/academy/auth/register

Register a new academy student.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "minimum10chars",
  "displayName": "Student Name",
  "username": "username"
}
```

**Response (200):**
```json
{ "ok": true }
```

**Errors:**
| Code | Meaning |
|------|---------|
| `username_taken` | Username already registered |
| `invalid_email` | Email format invalid |
| `weak_password` | Password under 10 characters |
| `academy_auth_service_not_configured` | Server secret not set |

---

### POST /api/academy/auth/login

Authenticate an existing academy student.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response (200):**
```json
{ "ok": true }
```

Sets `tecpey_academy_session` httpOnly cookie on success.

---

### POST /api/academy/auth/logout

End the academy session.

**Response (200):**
```json
{ "ok": true }
```

Clears the session cookie.

---

## Student Profile

### GET /api/academy-student-profile

Fetch the authenticated student's profile.

**Response (200):**
```json
{
  "profile": {
    "public_student_id": "abc123",
    "display_name": "Student Name",
    "username": "username",
    "avatar": "🧠",
    "streak_days": 5,
    "total_xp": 240,
    "completed_terms": 3,
    "overall_progress": 43,
    "earned_badges": ["Crypto Explorer", "Security Guardian"]
  }
}
```

**Response (401):** No active session.
```json
{ "profile": null }
```

---

### PATCH /api/academy-student-profile

Update the authenticated student's profile.

**Body (partial update):**
```json
{
  "displayName": "New Name",
  "avatar": "🔥"
}
```

**Response (200):**
```json
{ "ok": true }
```

---

## Term Progress

### POST /api/academy-term-progress

Record progress for a completed term quiz.

**Body:**
```json
{
  "termNumber": 1,
  "score": 8,
  "total": 10,
  "passed": true,
  "percent": 80
}
```

**Response (200):**
```json
{ "ok": true, "xp": 80 }
```

---

## Notifications

### GET /api/notifications

Fetch unread notifications for the authenticated student.

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "notif_1",
      "type": "badge_earned",
      "message": "You earned the Security Guardian badge!",
      "read": false,
      "createdAt": "2026-06-26T10:00:00Z"
    }
  ]
}
```

### POST /api/notifications/read

Mark notifications as read.

**Body:**
```json
{ "ids": ["notif_1", "notif_2"] }
```

---

## Community

### GET /api/community/profile

Fetch the public community profile of the authenticated student.

### GET /api/community/hall-of-fame

Fetch the top learners leaderboard.

**Response (200):**
```json
{
  "learners": [
    {
      "publicStudentId": "abc123",
      "displayName": "Top Student",
      "level": "Advanced",
      "xp": 700,
      "completedTerms": 7
    }
  ]
}
```

---

## AI Mentor

### POST /api/mentor-conversations/[action]

Submit a message to the AI mentor. The mentor routes the message context-aware based on the student's current term and learning history.

**Body:**
```json
{
  "message": "What is the difference between Market Cap and FDV?",
  "context": { "currentTerm": 4 }
}
```

---

## Trading Arena

### POST /api/trading-arena

Submit a practice trade decision.

**Body:**
```json
{
  "symbol": "BTC",
  "side": "buy",
  "orderType": "market",
  "risk": 2,
  "size": 1000,
  "entryReason": "RSI oversold with support confirmation",
  "emotion": "Calm",
  "plan": "Exit at resistance, stop at swing low"
}
```

**Response (200):**
```json
{
  "ok": true,
  "mentorNote": "Risk is controlled. Document entry reason, invalidation and exit scenario clearly.",
  "disciplineScore": 85
}
```

---

## Admin

All admin routes require `x-tecpey-admin-token` or an active admin session cookie.

### GET /api/command-center

Fetch platform-wide statistics for the admin dashboard.

### POST /api/command-center/campaign

Send a notification campaign to all students.

---

## Error Format

All API errors follow this format:

```json
{
  "ok": false,
  "error": "error_code_string"
}
```

Common error codes:

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `forbidden` | 403 | CSRF check failed |
| `unauthorized` | 401 | No valid session |
| `not_found` | 404 | Resource not found |
| `invalid_input` | 400 | Validation failed |
| `server_error` | 500 | Internal error |
| `admin_locked` | 503 | Admin not configured |
