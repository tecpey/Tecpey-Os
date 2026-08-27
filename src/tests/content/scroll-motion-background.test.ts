import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    assert.match(component, /\/media\/tecpey-scroll-motion-dark\.mp4/);
    assert.match(component, /\/media\/tecpey-scroll-motion-light\.mp4/);
    assert.match(component, /aria-hidden="true"/);
    assert.match(component, /\bmuted\b/);
    assert.match(component, /\bloop\b/);
    assert.match(component, /\bplaysInline\b/);
    assert.match(layout, /<TecpeyScrollMotionBackground \/>/);
    assert.doesNotMatch(component, /"\/academy\/trading-arena"/);
    assert.doesNotMatch(component, /"\/(?:en\/)?sign(?:in|up)"/);
    assert.doesNotMatch(component, /"\/(?:en\/)?academy\/(?:login|signup)"/);
    assert.doesNotMatch(component, /"\/swap"/);
    assert.doesNotMatch(component, /"\/command-center"/);
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
