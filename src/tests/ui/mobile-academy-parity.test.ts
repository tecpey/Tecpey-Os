import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const contentUi = read("src/components/content/ContentUI.tsx");
const englishUi = read("src/app/en/components/EnglishUI.tsx");
const englishParityCss = read("src/app/en/components/english-mobile-parity.module.css");
const calmHero = read("src/components/home/CalmLandingHero.tsx");
const livingNav = read("src/components/tecpey/LivingMobileNavigation.tsx");

describe("mobile Academy FA/EN parity", () => {
  it("removes the Persian Academy-only mobile top gap without weakening every ContentShell", () => {
    assert.match(contentUi, /child\.props\.eyebrow === "آکادمی تک‌پی"/);
    assert.match(contentUi, /academySurface \? "pt-0 lg:pt-24" : "pt-24"/);
    assert.match(contentUi, /academySurface \? "pb-10 pt-8 sm:pt-10" : "py-14"/);
  });

  it("uses the same Academy mobile hero rhythm in English", () => {
    assert.match(englishUi, /const academySurface = eyebrow === "Academy"/);
    assert.match(englishUi, /academySurface \? "pb-10 pt-8 sm:pt-10" : "py-14"/);
  });

  it("keeps Academy and AI Mentor hero actions shared across FA and EN", () => {
    assert.match(englishUi, /english-mobile-parity\.module\.css/);
    assert.match(calmHero, /const prefix = fa \? "" : "\/en"/);
    assert.match(calmHero, /href=\{`\$\{prefix\}\/academy`\}/);
    assert.match(calmHero, /href=\{`\$\{prefix\}\/academy\/ai-guide`\}/);
    assert.doesNotMatch(englishParityCss, /a\[href="\/en\/academy/);
    assert.doesNotMatch(englishParityCss, /display:\s*none/);
  });
});

describe("mobile bottom navigation viewport authority", () => {
  it("portals the fixed nav to document.body so transformed page ancestors cannot move it", () => {
    assert.match(livingNav, /import \{ createPortal \} from "react-dom"/);
    assert.match(livingNav, /return createPortal\(/);
    assert.match(livingNav, /document\.body/);
    assert.match(livingNav, /env\(safe-area-inset-bottom, 0px\)/);
  });

  it("does not reintroduce effect-driven mount state", () => {
    assert.doesNotMatch(livingNav, /useEffect/);
    assert.doesNotMatch(livingNav, /setMounted/);
    assert.match(livingNav, /useSyncExternalStore/);
  });
});
