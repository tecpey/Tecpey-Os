# QA — Academy Auth Session Redirect Loop Fix

Fixed:
- Academy auth/student cookies are no longer forced to `Secure` on localhost/HTTP test builds.
- Academy signup/login fetches now use `credentials: include`.
- After academy auth, the client verifies session/profile before redirecting.
- Academy profile APIs no longer treat exchange account cookies as academy identity.
- Floating Smart Center/Mentor CTA removed from academy layouts; Smart Center must live in navbar after academy profile activation.

Test path:
1. `/academy/signup`
2. Create dedicated academy account
3. Redirect to `/academy/onboarding`
4. Create academy profile
5. Redirect to `/academy/profile`
6. Navbar Smart Center becomes available only after profile exists.
