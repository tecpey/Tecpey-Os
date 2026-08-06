import { expect, test } from "@playwright/test";

// Public Trader Toolbox (#83.C): the tool directory must be a real, accessible,
// bilingual product surface — clickable cards that open an accessible detail
// dialog with the tool's description, platforms and its official link (with the
// destination host shown), category filters, and no Persian text leaking into
// the English experience.

function contractFor(testInfo) {
  const locale = testInfo.project.metadata.locale === "en" ? "en" : "fa";
  return locale === "en"
    ? {
        locale,
        path: "/en/trading-tools",
        dir: "ltr",
        anchorTool: "TradingView",
        anchorCategory: "Technical Analysis",
        categoriesLabel: "Categories",
        forbiddenCategory: /تحلیل تکنیکال|امنیت|اخبار/,
        platforms: /Platforms/i,
        officialSite: /Official site/i,
        filterCategory: "Security",
        allLabel: "All",
      }
    : {
        locale,
        path: "/trading-tools",
        dir: "rtl",
        anchorTool: "TradingView",
        anchorCategory: "تحلیل تکنیکال",
        categoriesLabel: "دسته‌بندی‌ها",
        forbiddenCategory: null,
        platforms: /پلتفرم‌ها/,
        officialSite: /سایت رسمی/,
        filterCategory: "امنیت",
        allLabel: "همه",
      };
}

test.beforeEach(async ({ context }) => {
  // Keep the page deterministic and avoid the slow live-news server path that
  // otherwise stalls a shared server worker in CI.
  await context.route("**/api/academy-auth", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false }) }),
  );
  await context.route("**/api/crypto-news**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "fallback" }) }),
  );
});

test("public Trader Toolbox is bilingual, filterable and opens an accessible tool dialog", async ({ page }, testInfo) => {
  const contract = contractFor(testInfo);
  await page.goto(contract.path, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await expect(page.locator("html")).toHaveAttribute("dir", contract.dir);

  // The directory renders real tool cards.
  const anchorCard = page.getByRole("button", { name: new RegExp(contract.anchorTool) });
  await expect(anchorCard.first()).toBeVisible();

  // Localized categories: the English surface must not leak Persian category text.
  const chipRow = page.getByRole("group", { name: contract.categoriesLabel });
  await expect(chipRow).toBeVisible();
  await expect(chipRow.getByRole("button", { name: contract.anchorCategory, exact: true })).toBeVisible();
  if (contract.forbiddenCategory) {
    await expect(chipRow).not.toContainText(contract.forbiddenCategory);
  }

  // Category filter narrows the grid.
  const filterChip = chipRow.getByRole("button", { name: contract.filterCategory, exact: true });
  await filterChip.click();
  await expect(filterChip).toHaveAttribute("aria-pressed", "true");

  // Reset to all and open the anchor tool's accessible dialog.
  await chipRow.getByRole("button", { name: contract.allLabel, exact: true }).click();
  await anchorCard.first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: new RegExp(contract.anchorTool) })).toBeVisible();
  await expect(dialog).toContainText(contract.platforms);

  // The official-site link is present and exposes its destination host.
  const officialLink = dialog.getByRole("link", { name: contract.officialSite });
  await expect(officialLink).toHaveAttribute("href", /^https?:\/\//);
  await expect(officialLink).toHaveAttribute("rel", /noopener/);

  // Escape closes the dialog and returns focus to the invoking card.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(anchorCard.first()).toBeFocused();
});
