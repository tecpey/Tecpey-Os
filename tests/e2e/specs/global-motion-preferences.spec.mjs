import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { expect, test } from "@playwright/test";

const stylesheet = fileURLToPath(new URL("../../../src/app/globals.css", import.meta.url));
const globals = (await postcss([tailwind()]).process(readFileSync(stylesheet, "utf8"), { from: stylesheet })).css;

// These six stylesheet fixtures need no application server or API calls.
// Keep their total worst-case budget bounded separately from product journeys.
test.setTimeout(15_000);

async function fixture(page, reducedMotion = "reduce") {
  await page.emulateMedia({ reducedMotion });
  await page.setContent(`
    <style>
      @keyframes futureEntry { from { opacity: 0; } to { opacity: 1; } }
      .future-entry { opacity: 0; animation: futureEntry 1s 5s both; }
      .entry { opacity: 0; }
      #transition { transition: opacity 1s 5s; }
      #pseudo::before { content: "Feedback"; opacity: 0; animation: futureEntry 1s 5s both; }
      button { display: block; width: 160px; height: 48px; margin: 24px; }
    </style>
    <button id="future" class="future-entry">New content</button>
    <button id="entry" class="entry animate-fade-in delay-500">Enter content</button>
    <button id="lift" class="hover-lift">Action</button>
    <button id="small" class="hover-lift-sm">Small action</button>
    <button id="card" class="tp-card">Card action</button>
    <button id="transition">Transition action</button>
    <button id="pseudo">Pseudo-element action</button>
    <div id="skeleton" class="skeleton">Loading</div>
    <div id="shimmer" class="animate-shimmer">Loading</div>
    <div id="float" class="swap-arrow-float">Arrow</div>
    <script>
      window.completed = [];
      document.addEventListener("animationend", event => window.completed.push(event.target.id));
    </script>
  `);
  await page.addStyleTag({ content: globals });
  await page.evaluate(locale => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }, test.info().project.metadata.locale);
}

test("reduced motion reveals delayed content and preserves completion events", async ({ page }) => {
  await fixture(page);
  for (const id of ["future", "entry"]) {
    await expect.poll(() => page.locator(`#${id}`).evaluate(element => getComputedStyle(element).opacity), { timeout: 1000 }).toBe("1");
    await expect.poll(() => page.evaluate(id => window.completed.includes(id), id), { timeout: 1000 }).toBe(true);
    expect(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).animationDelay)).toBe("0s");
  }
});

test("reduced motion suppresses hover displacement", async ({ page }) => {
  await fixture(page);
  for (const id of ["lift", "small", "card"]) {
    await page.locator(`#${id}`).hover();
    expect(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).transform)).toBe("none");
  }
});

test("hover displacement requires a fine pointer with hover support", async ({ page }) => {
  await fixture(page, "no-preference");
  const canHover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  for (const id of ["lift", "small", "card"]) {
    await page.locator(`#${id}`).hover();
    await expect.poll(() => page.locator(`#${id}`).evaluate(element => getComputedStyle(element).transform !== "none")).toBe(canHover);
  }
});

test("changing the OS preference releases pending entrance content without reload", async ({ page }) => {
  await fixture(page, "no-preference");
  expect(await page.locator("#future").evaluate(element => getComputedStyle(element).opacity)).toBe("0");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.locator("#future").evaluate(element => getComputedStyle(element).opacity), { timeout: 1000 }).toBe("1");
});

test("reduced motion removes transition and pseudo-element delays", async ({ page }) => {
  await fixture(page);
  expect(await page.locator("#transition").evaluate(element => getComputedStyle(element).transitionDelay)).toBe("0s");
  await expect.poll(() => page.locator("#pseudo").evaluate(element => getComputedStyle(element, "::before").opacity), { timeout: 1000 }).toBe("1");
  expect(await page.locator("#pseudo").evaluate(element => getComputedStyle(element, "::before").animationDelay)).toBe("0s");
});

test("decorative loading loops stay static in both themes", async ({ page }) => {
  await fixture(page);
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.documentElement.classList.toggle("dark", dark), dark);
    for (const id of ["skeleton", "shimmer", "float"]) {
      expect(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    }
  }
});
