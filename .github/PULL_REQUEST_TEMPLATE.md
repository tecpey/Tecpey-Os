# Pull Request

## Summary

<!-- Describe what this PR does in 1-3 sentences. -->

---

## Type of Change

- [ ] Bug fix (non-breaking, fixes an issue)
- [ ] New feature (non-breaking, adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] UI / Visual change
- [ ] Documentation update
- [ ] Refactor (no functional changes)
- [ ] Performance improvement
- [ ] Security fix

---

## What Changed

<!-- List the specific changes made. Be precise. -->

- 
- 
- 

---

## Affected Pages / Components

<!-- List all pages, routes, and components that are modified or affected. -->

- 
- 

---

## Pre-submission Checklist

### Code Quality
- [ ] `./node_modules/.bin/tsc --noEmit` passes with 0 errors
- [ ] `./node_modules/.bin/eslint .` introduces no new errors
- [ ] No `any` types without explicit justification

### Security (required for all PRs touching API or auth)
- [ ] All new `POST`/`PATCH`/`DELETE` routes call `verifyCsrfOrigin(req)`
- [ ] No secrets or API keys committed
- [ ] No new env var fallback chains introduced

### UI / UX
- [ ] Light mode tested
- [ ] Dark mode tested
- [ ] Mobile layout tested (375px viewport)
- [ ] Persian RTL layout unaffected (if applicable)
- [ ] English LTR layout unaffected (if applicable)
- [ ] Focus states work (keyboard navigation)
- [ ] No horizontal overflow on mobile

### Content
- [ ] No Persian text introduced into English pages
- [ ] No English text introduced into Persian pages without translation
- [ ] No profit promises or misleading financial claims

### Documentation
- [ ] `CHANGELOG.md` updated (for significant changes)
- [ ] Relevant docs in `/docs/` updated (if architectural change)

---

## Screenshots

<!-- For UI changes, include before/after screenshots. -->

**Before:**

**After:**

---

## Testing Notes

<!-- How was this tested? What scenarios were verified? -->

---

## Related Issues

<!-- Link related issues: Closes #123, Fixes #456 -->

---

## Additional Notes

<!-- Anything else the reviewer should know? -->
