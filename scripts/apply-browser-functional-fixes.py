from pathlib import Path

root = Path('.')

home_path = root / 'src/components/home/TecpeyHomeAI.tsx'
home = home_path.read_text()
replacements = {
    '{isFa ? "آموزش ۲۴ ساعته، بدون سیگنال‌فروشی" : "24/7 learning, no signal selling"}': '{isFa ? "یادگیری هنگام نیاز، بدون سیگنال‌فروشی" : "On-demand learning, no signal selling"}',
    '>Online</span>': '>{isFa ? "نمای آموزشی" : "Learning preview"}</span>',
}
for before, after in replacements.items():
    if before in home:
        home = home.replace(before, after, 1)
    elif after not in home:
        raise SystemExit(f'Home AI marker missing: {before}')
home_path.write_text(home)

navbar_path = root / 'src/components/navbar/Navbar.tsx'
navbar = navbar_path.read_text()
old_auth = '''  const authLink = (
    path: "https://my.tecpey.ir/signin" | "https://my.tecpey.ir/signup",
  ) => {
    if (appUrl) return `${appUrl}${path}`;
    return path === "https://my.tecpey.ir/signup"
      ? "https://my.tecpey.ir/signup"
      : "https://my.tecpey.ir/signin";
  };'''
new_auth = '''  const authLink = (path: "/signin" | "/signup") =>
    appUrl ? `${appUrl}${path}` : `https://my.tecpey.ir${path}`;'''
if old_auth in navbar:
    navbar = navbar.replace(old_auth, new_auth, 1)
elif new_auth not in navbar:
    raise SystemExit('Navbar authLink block missing')
navbar = navbar.replace('authLink("https://my.tecpey.ir/signin")', 'authLink("/signin")')
navbar = navbar.replace('authLink("https://my.tecpey.ir/signup")', 'authLink("/signup")')
navbar_path.write_text(navbar)

spec_path = root / 'src/tests/browser/public-golden-path.spec.ts'
spec = spec_path.read_text()
anchor = '''async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
'''
helper = '''async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function expectCanonicalAuthLinks(page: Page) {
  const hrefs = await page.locator("nav a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)),
  );
  expect(hrefs).toContain("https://my.tecpey.ir/signin");
  expect(hrefs).toContain("https://my.tecpey.ir/signup");
  expect(hrefs.some((href) => href.includes("tecpey.irhttps://"))).toBe(false);
}
'''
if anchor in spec:
    spec = spec.replace(anchor, helper, 1)
elif 'async function expectCanonicalAuthLinks' not in spec:
    raise SystemExit('Spec helper anchor missing')
spec = spec.replace(
    'const knowledge = page.locator("button:visible").filter({ hasText: label }).last();',
    'const knowledge = page.getByRole("button", { name: label, exact: true });',
    1,
)
spec = spec.replace('{ waitUntil: "domcontentloaded" }', '{ waitUntil: "load" }')
old_claims = '''  await expect(page.getByText("۲۴/۷", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/اولین معامله واقعی/)).toHaveCount(0);'''
new_claims = '''  await expect(page.getByText(/24\\/7|۲۴\\/۷|۲۴ ساعته/)).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/اولین معامله واقعی/)).toHaveCount(0);
  await expectCanonicalAuthLinks(page);'''
if old_claims in spec:
    spec = spec.replace(old_claims, new_claims, 1)
elif 'await expectCanonicalAuthLinks(page);' not in spec:
    raise SystemExit('Persian claims block missing')
english_anchor = '''  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");'''
english_replacement = '''  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByText(/24\\/7|۲۴\\/۷|۲۴ ساعته/)).toHaveCount(0);
  await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
  await expectCanonicalAuthLinks(page);'''
if english_anchor in spec:
    spec = spec.replace(english_anchor, english_replacement, 1)
elif spec.count('await expectCanonicalAuthLinks(page);') < 2:
    raise SystemExit('English claims anchor missing')
spec_path.write_text(spec)

guard_path = root / 'scripts/check-browser-golden-path-authority.mjs'
guard = guard_path.read_text()
guard = guard.replace('"npm run dev",', '"npm run build && npm run start",', 1)
insert = '''
const publicMentorSpotlight = read("src/components/home/TecpeyHomeAI.tsx");
for (const forbidden of ["24/7 learning", "آموزش ۲۴ ساعته", ">Online</span>"]) {
  if (publicMentorSpotlight.includes(forbidden)) {
    failures.push(`unsupported public Mentor claim remains: ${forbidden}`);
  }
}
for (const required of ["On-demand learning", "یادگیری هنگام نیاز", "Learning preview", "نمای آموزشی"]) {
  requireText(publicMentorSpotlight, required, `truthful public Mentor disclosure missing: ${required}`);
}

const navbar = read("src/components/navbar/Navbar.tsx");
for (const required of ['path: "/signin" | "/signup"', 'authLink("/signin")', 'authLink("/signup")']) {
  requireText(navbar, required, `canonical auth link boundary missing: ${required}`);
}
if (navbar.includes('authLink("https://my.tecpey.ir/')) {
  failures.push("Navbar still passes an absolute URL into the app-origin auth link builder");
}
'''
marker = 'const landing = read("src/app/home/enterprise/TecpeyEnterpriseLanding.tsx");\n'
if insert.strip() not in guard:
    if marker not in guard:
        raise SystemExit('Guard insertion marker missing')
    guard = guard.replace(marker, insert + '\n' + marker, 1)
for token in ['expectCanonicalAuthLinks', 'tecpey.irhttps://', '24\\/7|۲۴\\/۷|۲۴ ساعته']:
    if token not in guard:
        # Add coverage tokens to the existing spec token list before its closing bracket.
        list_marker = '  \'localStorage.getItem("theme")\',\n]) {'
        if list_marker not in guard:
            raise SystemExit(f'Guard spec list marker missing for {token}')
        guard = guard.replace(list_marker, f'  "{token}",\n' + list_marker, 1)
guard_path.write_text(guard)

(root / 'scripts/apply-browser-functional-fixes.py').unlink(missing_ok=True)
