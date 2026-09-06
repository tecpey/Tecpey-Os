import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveRequestLocale } from "@/i18n/runtime";
import { isProfileFreeRoute } from "@/lib/request-route-context";

test("shared locale runtime resolves active locales and preserves semantic route identity", () => {
  assert.deepEqual(resolveRequestLocale("/academy/trading-arena"), {
    status: "active",
    locale: "fa",
    semanticPath: "/academy/trading-arena",
    htmlLang: "fa-IR",
    direction: "rtl",
    routeSegment: "",
  });

  assert.deepEqual(resolveRequestLocale("/en/academy/trading-arena"), {
    status: "active",
    locale: "en",
    semanticPath: "/academy/trading-arena",
    htmlLang: "en-US",
    direction: "ltr",
    routeSegment: "en",
  });
});

test("quality-gated locale prefixes are recognized without becoming active runtime locales", () => {
  assert.deepEqual(resolveRequestLocale("/ar/academy"), {
    status: "quality_gated",
    locale: "ar",
    semanticPath: "/academy",
    htmlLang: "ar",
    direction: "rtl",
    routeSegment: "ar",
  });

  assert.deepEqual(resolveRequestLocale("/pt-br/crypto-news"), {
    status: "quality_gated",
    locale: "pt-BR",
    semanticPath: "/crypto-news",
    htmlLang: "pt-BR",
    direction: "ltr",
    routeSegment: "pt-br",
  });
});

test("profile-free route policy follows semantic routes instead of duplicated locale allowlists", () => {
  assert.equal(isProfileFreeRoute("/academy/trading-arena"), true);
  assert.equal(isProfileFreeRoute("/en/academy/trading-arena"), true);
  assert.equal(isProfileFreeRoute("/es/academy/trading-arena"), true);
  assert.equal(isProfileFreeRoute("/pt-br/academy/mentor-coach/"), true);
  assert.equal(isProfileFreeRoute("/fr/academy/profile"), false);
});

test("root and client html locale authorities no longer hardcode English route detection", () => {
  const rootLayout = readFileSync("src/app/layout.tsx", "utf8");
  const htmlLangDir = readFileSync("src/components/seo/HtmlLangDir.tsx", "utf8");

  assert.match(rootLayout, /resolveRequestLocale\(requestPath\)/);
  assert.match(rootLayout, /runtimeLocale\.status !== "active"/);
  assert.match(rootLayout, /notFound\(\)/);
  assert.doesNotMatch(rootLayout, /const isEnglish =/);
  assert.doesNotMatch(rootLayout, /startsWith\("\/en\/"\)/);

  assert.match(htmlLangDir, /getLocaleFromPathname\(pathname\)/);
  assert.match(htmlLangDir, /getLocaleDefinition\(locale\)/);
  assert.doesNotMatch(htmlLangDir, /isEnPath/);
});
