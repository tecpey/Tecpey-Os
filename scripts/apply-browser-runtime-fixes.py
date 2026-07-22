from pathlib import Path

root = Path('.')

layout_path = root / 'src/app/layout.tsx'
layout = layout_path.read_text()
if 'import { headers } from "next/headers";' not in layout:
    layout = layout.replace(
        'import type { ReactNode } from "react";\n',
        'import type { ReactNode } from "react";\nimport { headers } from "next/headers";\n',
        1,
    )
if 'REQUEST_ROUTE_CONTEXT_HEADER' not in layout:
    layout = layout.replace(
        'import { buildFAQSchema, TECPEY_FAQS } from "@/lib/seo";\n',
        'import { buildFAQSchema, TECPEY_FAQS } from "@/lib/seo";\nimport { REQUEST_ROUTE_CONTEXT_HEADER } from "@/lib/request-route-context";\n',
        1,
    )
old_locale = '''  const locale = "fa";
  const messages = (await import(`../i18n/messages/fa.json`)).default;
  const user = await getProfileInfo();
  const metaData = await getMetaData();
'''
new_locale = '''  const requestHeaders = await headers();
  const pathname = requestHeaders.get(REQUEST_ROUTE_CONTEXT_HEADER) ?? "/";
  const isEnglishPath = pathname === "/en" || pathname.startsWith("/en/");
  const locale = isEnglishPath ? "en" : "fa";
  const messages = (await import(`../i18n/messages/${locale}.json`)).default;
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const user = await getProfileInfo();
  const metaData = await getMetaData();
'''
if old_locale in layout:
    layout = layout.replace(old_locale, new_locale, 1)
elif new_locale not in layout:
    raise SystemExit('root layout locale block missing')
old_html = '''    <html
      lang="fa-IR"
      dir="rtl"
      suppressHydrationWarning
    >'''
new_html = '''    <html
      lang={isEnglishPath ? "en-US" : "fa-IR"}
      dir={isEnglishPath ? "ltr" : "rtl"}
      suppressHydrationWarning
    >'''
if old_html in layout:
    layout = layout.replace(old_html, new_html, 1)
elif new_html not in layout:
    raise SystemExit('root layout html block missing')
layout = layout.replace(
    '        <script\n          type="application/ld+json"',
    '        <script\n          nonce={nonce}\n          type="application/ld+json"',
    1,
)
layout = layout.replace('<ThemeProvider>', '<ThemeProvider nonce={nonce}>', 1)
layout_path.write_text(layout)

theme_path = root / 'src/components/theme-provider.tsx'
theme = theme_path.read_text()
old_theme = '''export function ThemeProvider({
  children,
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"'''
new_theme = '''export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      {...props}
      attribute="class"'''
if old_theme in theme:
    theme = theme.replace(old_theme, new_theme, 1)
elif new_theme not in theme:
    raise SystemExit('theme provider block missing')
theme_path.write_text(theme)

spec_path = root / 'src/tests/browser/public-golden-path.spec.ts'
spec = spec_path.read_text()
spec = spec.replace(
    'page.getByRole("heading", { name: "تک‌پی، نقطه امن ورود به بازار رمزارز" })',
    'page.getByRole("heading", { name: "تک‌پی، نقطه امن ورود به بازار رمزارز", level: 1 })',
    1,
)
spec = spec.replace(
    'await expect(page.locator("html")).toHaveAttribute("dir", "ltr");',
    'await expect(page.locator("html")).toHaveAttribute("dir", "ltr");\n  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");',
    1,
)
spec_path.write_text(spec)

guard_path = root / 'scripts/check-browser-golden-path-authority.mjs'
guard = guard_path.read_text()
insert = '''
const rootLayout = read("src/app/layout.tsx");
for (const token of [
  "REQUEST_ROUTE_CONTEXT_HEADER",
  'requestHeaders.get("x-nonce")',
  'lang={isEnglishPath ? "en-US" : "fa-IR"}',
  'dir={isEnglishPath ? "ltr" : "rtl"}',
  "<ThemeProvider nonce={nonce}>",
]) {
  requireText(rootLayout, token, `server locale/CSP nonce boundary missing: ${token}`);
}
const themeProvider = read("src/components/theme-provider.tsx");
requireText(themeProvider, "{...props}", "ThemeProvider must forward the CSP nonce to next-themes");
'''
marker = 'const landing = read("src/app/home/enterprise/TecpeyEnterpriseLanding.tsx");\n'
if insert.strip() not in guard:
    if marker not in guard:
        raise SystemExit('guard marker missing')
    guard = guard.replace(marker, insert + '\n' + marker, 1)
guard_path.write_text(guard)

# Remove this staging script from the resulting branch commit.
(root / 'scripts/apply-browser-runtime-fixes.py').unlink(missing_ok=True)
