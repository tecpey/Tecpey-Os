import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("entry redesign preserves real authentication and localized destinations", async () => {
  const auth = await read("src/components/academy/AcademyAuthClient.tsx");
  for (const contract of [
    'onSubmit={submit}',
    'resolveAcademyPostAuthPath(locale, profileState, requestedPath)',
    'autoComplete={isSignup ? "new-password" : "current-password"}',
    'autoComplete="one-time-code"',
    'aria-current={!isSignup ? "page" : undefined}',
    'aria-current={isSignup ? "page" : undefined}',
    'https://my.tecpey.ir/signin',
    '<details className={styles.otherMethods}>',
  ]) assert.ok(auth.includes(contract), `Missing contract: ${contract}`);
  assert.match(auth, /type="button"\s+disabled/);
  assert.doesNotMatch(auth, /window-controls|bg-rose-400/);
});

test("entry styling includes touch, keyboard, RTL and reduced motion safeguards", async () => {
  const css = await read("src/components/home/calm-entry.module.css");
  for (const rule of [
    'prefers-reduced-motion: reduce',
    'prefers-contrast: more',
    'hover: hover',
    ':focus-visible',
    'min-height: 48px',
    'grid-template-columns: minmax(0, 1fr)',
    'margin-inline',
    '.authForm input { font-size: 1rem',
  ]) assert.ok(css.includes(rule), `Missing safeguard: ${rule}`);
  assert.doesNotMatch(css, /transition:\s*all|backdrop-filter|animation:.*infinite/);
});

test("both landing locales use the same compact story and accessible closing sections", async () => {
  const files = [
    ["fa", "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx"],
    ["en", "src/app/en/EnglishLandingClient.tsx"],
  ];
  for (const [locale, path] of files) {
    const page = await read(path);
    for (const component of ["HomeAiMentorSpotlight", "HomeLearningJourney"]) {
      assert.ok(page.includes(`<${component} locale="${locale}" compact />`));
    }
    assert.ok(page.includes(`<LandingDetails locale="${locale}">`));
    assert.ok(page.includes(`<CalmLandingClose locale="${locale}" />`));
    assert.ok(page.indexOf("</LandingDetails>") < page.indexOf("<CalmLandingClose"));
  }
  const sections = await read("src/components/home/CalmProductSections.tsx");
  assert.match(sections, /<details key=\{question\}><summary>/);
  assert.match(sections, /<details className=\{styles.extendedDetails\}/);
  assert.match(sections, /aria-labelledby=/);
  for (const route of ["/risk-disclosure", "/academy/signup", "/academy/login", "/academy/curriculum", "/academy/trading-arena"]) {
    assert.ok(sections.includes(route), `Missing destination: ${route}`);
  }
  assert.match(sections, /Real-money services on this platform are not active/);
  assert.match(sections, /خدمات پول واقعی این پلتفرم فعال نیست/);
  assert.doesNotMatch(sections, /۳ ترم کامل|3 terms done|setInterval/);
});
