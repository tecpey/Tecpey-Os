import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTecpeyDarkScrollMotionSurface,
  isTecpeyScrollMotionRoute,
} from "@/components/brand/tecpey-scroll-motion-routes";
import {
  calculateTecpeyMotionMarkFrame,
  hashTecpeyMotionRoute,
  TECPEY_MOTION_MARKS,
} from "@/components/brand/tecpey-scroll-motion-field";
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
const academyPagePath = path.join(root, "src/app/academy/page.tsx");
const academyPageEnPath = path.join(root, "src/app/en/academy/page.tsx");
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
    assert.match(component, /MOTION_FADE_MS = 260/);
    assert.match(component, /MOTION_ROUTE_EXIT_MS = 220/);
    assert.match(component, /data-visible=\{isVisible \? "true" : "false"\}/);
    assert.match(component, /renderedPathRef\.current === pathname/);
    assert.match(component, /commitSurface\(null, null\)/);
    assert.match(component, /calculateTecpeyMotionMarkFrame\(mark/);
    assert.match(component, /element\.style\.opacity = frame\.opacity\.toFixed\(3\)/);
    assert.match(component, /scrollY: window\.scrollY/);
    assert.match(component, /<TecpeyMark alt=""/);
    assert.match(component, /connection\?\.saveData === true/);
    assert.match(component, /addEventListener\("visibilitychange", syncPlayback\)/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(styles, /\.tecpey-scroll-motion-background__media/);
    assert.match(styles, /transition: opacity var\(--tp-duration-panel\) var\(--tp-ease-out\)/);
    assert.match(styles, /mask-image: linear-gradient/);
    assert.match(styles, /\.tecpey-scroll-motion-background__mark:nth-child\(n \+ 11\)/);
    assert.match(styles, /\.tecpey-scroll-motion-background__mark[\s\S]*?will-change: transform/);
    assert.doesNotMatch(
      styles,
      /\.tecpey-scroll-motion-background[\s\S]*?\{[^}]*transition:\s*all/
    );
  });

  it("moves, edge-fades, and deterministically relocates decorative marks", () => {
    const mark = TECPEY_MOTION_MARKS[0];
    const routeSeed = hashTecpeyMotionRoute("/academy/term-1");
    const viewport = {
      viewportWidth: 390,
      viewportHeight: 844,
      routeSeed,
    };
    const initial = calculateTecpeyMotionMarkFrame(mark, {
      ...viewport,
      scrollY: 0,
    });
    const scrolled = calculateTecpeyMotionMarkFrame(mark, {
      ...viewport,
      scrollY: 420,
    });
    const nextCycle = calculateTecpeyMotionMarkFrame(mark, {
      ...viewport,
      scrollY: 2_100,
    });

    assert.equal(TECPEY_MOTION_MARKS.length, 14);
    for (const configuredMark of TECPEY_MOTION_MARKS) {
      const before = calculateTecpeyMotionMarkFrame(configuredMark, {
        ...viewport,
        scrollY: 0,
      });
      const after = calculateTecpeyMotionMarkFrame(configuredMark, {
        ...viewport,
        scrollY: 48,
      });

      assert.ok(after.y < before.y, `mark ${configuredMark.seed} must move upward`);
      assert.ok(before.x >= 0 && before.x + configuredMark.size <= viewport.viewportWidth);
      assert.ok(before.opacity >= 0 && before.opacity <= configuredMark.opacity);
    }

    assert.ok(scrolled.y < initial.y, "scrolling down must move the mark upward");
    assert.notEqual(nextCycle.cycleIndex, initial.cycleIndex);
    assert.notEqual(nextCycle.x, initial.x, "a new cycle must choose a new x position");
    assert.ok(initial.opacity < mark.opacity, "the lower edge must fade the mark in");
    assert.ok(scrolled.opacity > 0);

    const repeated = calculateTecpeyMotionMarkFrame(mark, {
      ...viewport,
      scrollY: 2_100,
    });
    assert.deepEqual(repeated, nextCycle, "placement must be stable for the same route and scroll");

    const otherRoute = calculateTecpeyMotionMarkFrame(mark, {
      ...viewport,
      routeSeed: hashTecpeyMotionRoute("/academy/term-2"),
      scrollY: 2_100,
    });
    assert.notEqual(otherRoute.x, nextCycle.x, "each route must receive a distinct placement field");
  });

  it("keeps dark Academy callouts readable over the light motion surface", () => {
    const academyPage = fs.readFileSync(academyPagePath, "utf8");
    const academyPageEn = fs.readFileSync(academyPageEnPath, "utf8");

    assert.match(
      academyPage,
      /border-emerald-300\/20 bg-\[radial-gradient\([^\n]+linear-gradient\(145deg,#06131f,#0f172a\)\]/
    );
    assert.match(
      academyPageEn,
      /border-emerald-300\/20 bg-\[radial-gradient\([^\n]+linear-gradient\(145deg,#06131f,#0f172a\)\]/
    );
    assert.match(
      academyPage,
      /border-violet-300\/20 bg-\[radial-gradient\([^\n]+linear-gradient\(145deg,#0b1022,#17122e\)\]/
    );
    assert.match(
      academyPage,
      /Case Study Lab؛ یادگیری از سناریوهای واقعی بازار<\/h2>/
    );
    assert.match(
      academyPage,
      /text-3xl font-black text-slate-950 dark:text-white">Case Study Lab/
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
