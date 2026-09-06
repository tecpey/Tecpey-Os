import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { localizePath } from "@/i18n/config";
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

  assert.equal(
    localizePath("en", "/academy/trading-arena"),
    "/en/academy/trading-arena",
  );
  assert.equal(
    localizePath("fa", "/en/academy/trading-arena"),
    "/academy/trading-arena",
  );
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

test("next-intl request authority and proxy policy both follow the canonical URL locale", () => {
  const requestConfig = readFileSync("src/i18n/request.ts", "utf8");
  const proxy = readFileSync("src/proxy.ts", "utf8");

  assert.match(requestConfig, /REQUEST_ROUTE_CONTEXT_HEADER/);
  assert.match(requestConfig, /resolveRequestLocale\(requestPath\)/);
  assert.doesNotMatch(requestConfig, /getUserLocale\(/);

  assert.match(proxy, /resolveLocalePath\(pathname\)/);
  assert.match(proxy, /isActiveLocale\(locale\)/);
  assert.match(proxy, /localizePath\(locale, "\/academy\/login"\)/);
  assert.doesNotMatch(proxy, /"\/en\/academy\/login"/);
  assert.doesNotMatch(proxy, /pathname\.startsWith\("\/en\/academy\/"\)/);
});

test("language switcher preserves semantic route identity through canonical localization helpers", () => {
  const navbar = readFileSync("src/components/navbar/Navbar.tsx", "utf8");

  assert.match(navbar, /getLocaleFromPathname\(pathname\)/);
  assert.match(navbar, /resolveLocalePath\(pathname\)/);
  assert.match(navbar, /localizePath\("fa", pathname\)/);
  assert.match(navbar, /localizePath\("en", pathname\)/);
  assert.doesNotMatch(navbar, /pathname\.replace\(\/\^\\\/en/);
  assert.doesNotMatch(navbar, /pathname\.startsWith\("\/en"\)/);
});
