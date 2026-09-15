import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const tokens = read("src/app/tecpey-brand-tokens.css");
const premiumIcon = read("src/components/tecpey/NeonIcon.tsx");
const livingNav = read("src/components/tecpey/LivingMobileNavigation.tsx");
const navbar = read("src/components/navbar/Navbar.tsx");
const theme = read("src/components/ThemeToggle.tsx");
const story = read("src/components/home/TecpeyGrowthStory.tsx");

describe("TecPey premium interaction foundation", () => {
  it("keeps tactile feedback bounded, pointer-aware and motion-safe", () => {
    assert.match(tokens, /\.tecpey-pressable\s*\{[\s\S]*?touch-action: manipulation/);
    assert.match(tokens, /\.tecpey-pressable:active\s*\{[\s\S]*?scale\(0\.97\)/);
    assert.match(tokens, /@media \(hover: hover\) and \(pointer: fine\)/);
    assert.match(tokens, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(tokens, /transition:\s*all/);
  });

  it("uses one governed icon family with semantic premium treatments", () => {
    assert.match(premiumIcon, /import type \{ LucideIcon \} from "lucide-react"/);
    assert.match(premiumIcon, /data-tone=\{tone\}/);
    assert.match(premiumIcon, /role=\{label \? "img" : undefined\}/);
    assert.match(tokens, /\.tecpey-icon-shell\[data-tone="success"\]/);
    assert.match(tokens, /\.tecpey-icon-shell\[data-tone="warning"\]/);
    assert.doesNotMatch(premiumIcon, /<svg|<path/);
  });

  it("applies the shared system to global navigation and theme controls", () => {
    assert.match(navbar, /tecpey-site-nav/);
    assert.match(navbar, /tecpey-icon-button tecpey-pressable/);
    assert.match(theme, /tecpey-icon-shell/);
    assert.match(livingNav, /stroke-\[2\.25\]/);
    assert.match(tokens, /\.tecpey-living-mobile-nav__item\[data-active="true"\]/);
  });

  it("carries premium icons into the localized eight-stage landing story", () => {
    assert.match(story, /import \{ PremiumIcon \}/);
    assert.match(story, /<PremiumIcon icon=\{Icon\} size="sm" \/>/);
    assert.match(story, /data-journey-stage=\{stage\}/);
    assert.match(story, /data-journey-stage="8"/);
  });
});
