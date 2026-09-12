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

test("both landing locales share the growth story and accessible details", async () => {
  for (const [locale, path] of [["fa", "src/app/home/enterprise/TecpeyEnterpriseLanding.tsx"], ["en", "src/app/en/EnglishLandingClient.tsx"]]) {
    assert.ok((await read(path)).includes(`<TecpeyGrowthStory locale="${locale}"`));
  }
  const story = await read("src/components/home/TecpeyGrowthStory.tsx");
  assert.match(story, /<details className=\{styles.details\}><summary>/);
  assert.match(story, /aria-labelledby=/);
  assert.match(story, /no real money involved/);
  assert.match(story, /بدون پول واقعی/);
});
