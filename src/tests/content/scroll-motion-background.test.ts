import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTecpeyDarkScrollMotionSurface,
  isTecpeyScrollMotionRoute,
} from "@/components/brand/tecpey-scroll-motion-routes";
import { academyArticles } from "@/data/academy";
import { academyPathTerms } from "@/data/academyPath";
import { academyPathTermsEn } from "@/data/academyPathEn";
import { learningSeoPages } from "@/data/organicSeo";

const root = process.cwd();
const componentPath = path.join(
  root,
  "src/components/brand/TecpeyScrollMotionBackground.tsx"
);
const stylesPath = path.join(root, "src/app/tecpey-brand-tokens.css");
const layoutPath = path.join(root, "src/app/layout.tsx");
const darkVideoPath = path.join(root, "public/media/tecpey-scroll-motion-dark.mp4");
const lightVideoPath = path.join(root, "public/media/tecpey-scroll-motion-light.mp4");

describe("TecPey scroll motion background", () => {
  it("ships one theme-aware decorative video layer on governed marketing surfaces", () => {
    const component = fs.readFileSync(componentPath, "utf8");
    const layout = fs.readFileSync(layoutPath, "utf8");

    assert.match(component, /resolvedTheme === "light"/);
    assert.match(component, /useSyncExternalStore/);
    assert.match(component, /getServerSnapshot = \(\) => false/);
    assert.match(component, /\/media\/tecpey-scroll-motion-dark\.mp4/);
    assert.match(component, /\/media\/tecpey-scroll-motion-light\.mp4/);
    assert.match(component, /aria-hidden="true"/);
    assert.match(component, /\bmuted\b/);
    assert.match(component, /\bloop\b/);
    assert.match(component, /\bplaysInline\b/);
    assert.match(layout, /<TecpeyScrollMotionBackground \/>/);
  });

  it("covers every Academy term, lesson, and long-form learning surface", () => {
    for (const term of academyPathTerms) {
      assert.equal(isTecpeyScrollMotionRoute(`/academy/${term.slug}`), true);
    }

    for (const term of academyPathTermsEn) {
      assert.equal(isTecpeyScrollMotionRoute(`/en/academy/${term.slug}`), true);
    }

    for (const article of academyArticles) {
      assert.equal(isTecpeyScrollMotionRoute(`/academy/${article.slug}`), true);
    }

    for (const page of learningSeoPages) {
      assert.equal(isTecpeyScrollMotionRoute(`/learn/${page.slug}`), true);
    }

    assert.equal(isTecpeyScrollMotionRoute("/academy/learn/term-1/1"), true);
    assert.equal(isTecpeyScrollMotionRoute("/academy/learn/term-1/12/"), true);
    assert.equal(isTecpeyDarkScrollMotionSurface("/academy/learn/term-1/1"), true);
    assert.equal(isTecpeyScrollMotionRoute("/academy/what-is-bitcoin"), true);
    assert.equal(isTecpeyScrollMotionRoute("/learn/technical-analysis-basics"), true);
    assert.equal(isTecpeyScrollMotionRoute("/glossary/liquidity"), true);
    assert.equal(isTecpeyScrollMotionRoute("/en/glossary/liquidity"), true);
  });

  it("keeps auth, assessment, interactive practice, and financial surfaces motion-free", () => {
    const excludedRoutes = [
      "/signin",
      "/signup",
      "/academy/login",
      "/academy/signup",
      "/academy/final-assessment",
      "/academy/trading-arena",
      "/academy/trading-arena/journal",
      "/academy/simulator",
      "/academy/practice-lab",
      "/academy/flashcards",
      "/academy/ai-guide",
      "/markets",
      "/swap",
      "/command-center",
    ];

    for (const route of excludedRoutes) {
      assert.equal(isTecpeyScrollMotionRoute(route), false, route);
    }
  });

  it("links scroll through a passive rAF transform and honours motion/data preferences", () => {
    const component = fs.readFileSync(componentPath, "utf8");
    const styles = fs.readFileSync(stylesPath, "utf8");

    assert.match(component, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
    assert.match(component, /requestAnimationFrame\(updatePosition\)/);
    assert.match(component, /addEventListener\("scroll", schedulePositionUpdate, \{ passive: true \}\)/);
    assert.match(component, /translate3d\(0,/);
    assert.match(component, /connection\?\.saveData === true/);
    assert.match(component, /addEventListener\("visibilitychange", syncPlayback\)/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(styles, /\.tecpey-scroll-motion-background__media/);
    assert.doesNotMatch(
      styles,
      /\.tecpey-scroll-motion-background[\s\S]*?\{[^}]*transition:\s*all/
    );
  });

  it("keeps both supplied H.264 backgrounds within the bounded page-weight budget", () => {
    const darkVideo = fs.readFileSync(darkVideoPath);
    const lightVideo = fs.readFileSync(lightVideoPath);

    assert.equal(darkVideo.subarray(4, 8).toString("ascii"), "ftyp");
    assert.equal(lightVideo.subarray(4, 8).toString("ascii"), "ftyp");
    assert.ok(darkVideo.includes(Buffer.from("avc1")));
    assert.ok(lightVideo.includes(Buffer.from("avc1")));
    assert.ok(darkVideo.byteLength < 800_000);
    assert.ok(lightVideo.byteLength < 800_000);
  });
});
