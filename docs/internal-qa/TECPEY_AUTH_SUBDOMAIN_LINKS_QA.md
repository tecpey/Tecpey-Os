# TecPey Auth Subdomain Links QA

Applied auth routing patch.

## Fixed
- Login/signin links now point to `https://my.tecpey.ir/signin`.
- Signup/register links now point to `https://my.tecpey.ir/signup`.
- Internal `/login`, `/signin`, `/signup`, `/en/signin`, `/en/signup` pages redirect to the correct subdomain.
- `NEXT_PUBLIC_API_URL` examples now use `https://my.tecpey.ir`.

## QA Target
- No user should land on a 404 auth page.
- Auth is handled by the dedicated user dashboard subdomain.
