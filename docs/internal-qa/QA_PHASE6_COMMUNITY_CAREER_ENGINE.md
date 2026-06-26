# QA Phase 6 — Community + Career Engine + Public Identity

## Scope
- Public learner profile
- Hall of Fame with local and DB fallback
- Career Engine snapshot
- Professional challenges
- Privacy-first public identity

## Key Decisions
- Public profile shows display name, username, avatar and learning achievements.
- TecPey ID remains internal and is not the primary public identity.
- Rankings and challenges are based on official learning, achievement and arena signals.
- No signal-selling, profit promise, or sensitive private student data is displayed.

## Test Commands
```bash
npm run qa:phase6-core
npm run qa:core
npm run check
npm run build
```

## Manual QA
1. Sign up to Academy.
2. Create Academy profile.
3. Open `/academy/community`.
4. Open `/academy/career`.
5. Open `/academy/challenges`.
6. Open `/student/<username>`.
7. Confirm private data is not visible publicly.
