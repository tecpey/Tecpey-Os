const PUBLIC_STORY_ROUTES = new Set([
  "/",
  "/en",
  "/about",
  "/en/about",
  "/business",
  "/en/business",
  "/partners",
  "/en/partners",
  "/start-guide",
  "/en/start-guide",
  "/why-tecpey",
  "/en/why-tecpey",
]);

const ACADEMY_READING_ROUTES = new Set([
  "/academy",
  "/en/academy",
  "/academy/onboarding",
  "/en/academy/onboarding",
  "/academy/free",
  "/en/academy/free",
  "/academy/curriculum",
  "/en/academy/curriculum",
  "/academy/education-first",
  "/academy/persian-clarity",
  "/academy/risk-aware",
  "/academy/safe-entry",
  "/academy/security-first",
  "/academy/tool-based-decisions",
]);

// These slugs are the long-form public Academy articles. Keeping this list
// explicit prevents product, assessment, auth, and financial routes from
// accidentally inheriting decorative motion.
const ACADEMY_ARTICLE_ROUTES = new Set([
  "/academy/what-is-bitcoin",
  "/academy/what-is-usdt",
  "/academy/how-to-buy-usdt-in-iran",
  "/academy/crypto-exchange-security",
  "/academy/technical-analysis-basics",
  "/academy/crypto-fees-explained",
  "/academy/what-is-blockchain",
  "/academy/wallet-vs-exchange",
  "/academy/risk-management-in-crypto",
  "/academy/how-to-choose-crypto-exchange",
  "/academy/crypto-scam-and-phishing",
  "/academy/live-crypto-price-guide",
]);

const ACADEMY_TERM_ROUTE = /^\/(?:en\/)?academy\/term-[1-9]\d*$/;
const ACADEMY_LESSON_ROUTE = /^\/(?:en\/)?academy\/learn\/[a-z0-9-]+\/[1-9]\d*$/;
const LEARNING_CENTER_ROUTE = /^\/learn(?:\/[a-z0-9-]+)?$/;
const GLOSSARY_ROUTE = /^\/(?:en\/)?glossary(?:\/[a-z0-9-]+)?$/;

export function normalizeTecpeyScrollMotionPathname(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function isTecpeyScrollMotionRoute(pathname: string) {
  const normalized = normalizeTecpeyScrollMotionPathname(pathname);

  return (
    PUBLIC_STORY_ROUTES.has(normalized) ||
    ACADEMY_READING_ROUTES.has(normalized) ||
    ACADEMY_ARTICLE_ROUTES.has(normalized) ||
    ACADEMY_TERM_ROUTE.test(normalized) ||
    ACADEMY_LESSON_ROUTE.test(normalized) ||
    LEARNING_CENTER_ROUTE.test(normalized) ||
    GLOSSARY_ROUTE.test(normalized)
  );
}

export function isTecpeyDarkScrollMotionSurface(pathname: string) {
  return ACADEMY_LESSON_ROUTE.test(
    normalizeTecpeyScrollMotionPathname(pathname)
  );
}
