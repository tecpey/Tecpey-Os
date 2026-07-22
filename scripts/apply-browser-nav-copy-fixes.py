from pathlib import Path

root = Path('.')

home_path = root / 'src/components/home/TecpeyHomeAI.tsx'
home = home_path.read_text()
copy_changes = {
    '{isFa ? "آموزش ۲۴ ساعته، بدون سیگنال‌فروشی" : "24/7 learning, no signal selling"}': '{isFa ? "یادگیری هنگام نیاز، بدون سیگنال‌فروشی" : "On-demand learning, no signal selling"}',
    '>Online</span>': '>{isFa ? "نمای آموزشی" : "Learning preview"}</span>',
}
for before, after in copy_changes.items():
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
for before, after in {
    'authLink("https://my.tecpey.ir/signin")': 'authLink("/signin")',
    'authLink("https://my.tecpey.ir/signup")': 'authLink("/signup")',
}.items():
    navbar = navbar.replace(before, after)
navbar_path.write_text(navbar)

(root / 'scripts/apply-browser-nav-copy-fixes.py').unlink(missing_ok=True)
