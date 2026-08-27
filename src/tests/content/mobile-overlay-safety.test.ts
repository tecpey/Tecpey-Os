import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const navbarPath = path.join(root, "src/components/navbar/Navbar.tsx");
const publicMentorPath = path.join(
  root,
  "src/components/academy/PublicMentorEntry.tsx",
);
const globalMentorPath = path.join(
  root,
  "src/components/academy/GlobalAiMentorWidget.tsx",
);

describe("mobile overlay safety", () => {
  it("covers the viewport directly below the 64px mobile navbar", () => {
    const navbar = fs.readFileSync(navbarPath, "utf8");

    assert.match(navbar, /top-16/);
    assert.match(navbar, /h-\[calc\(100dvh-4rem\)\]/);
    assert.match(navbar, /overflow-y-auto bg-navbar-bg px-5/);
    assert.doesNotMatch(navbar, /top-\[88px\]/);
    assert.doesNotMatch(navbar, /bg-navbar-bg\/98/);
  });

  it("locks document scrolling and exposes correct menu semantics", () => {
    const navbar = fs.readFileSync(navbarPath, "utf8");

    assert.match(navbar, /document\.body\.style\.overflow = "hidden"/);
    assert.match(navbar, /aria-controls=\{mobileMenuId\}/);
    assert.match(navbar, /isOpen[\s\S]*?"Close menu"/);
    assert.match(navbar, /isOpen[\s\S]*?"بستن منو"/);
  });

  it("keeps mentor triggers clear of mobile CTAs and auth forms", () => {
    const publicMentor = fs.readFileSync(publicMentorPath, "utf8");
    const globalMentor = fs.readFileSync(globalMentorPath, "utf8");

    assert.match(
      publicMentor,
      /bottom-\[calc\(env\(safe-area-inset-bottom\)\+5\.75rem\)\]/,
    );
    assert.match(publicMentor, /inline-flex h-12 w-12/);
    assert.match(publicMentor, /sr-only sm:not-sr-only sm:truncate/);
    assert.match(publicMentor, /isAcademyAuthRoute \|\| profileStatus/);
    assert.match(globalMentor, /isNewsQuiz \|\|\s*isAcademyAuthRoute/);
    assert.match(
      globalMentor,
      /!isAcademyAuthRoute && \(open \|\| isAcademyArea\)/,
    );
  });
});
