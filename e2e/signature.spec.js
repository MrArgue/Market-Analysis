import { test, expect } from "@playwright/test";
test.use({
  viewport: { width: 390, height: 844 },
  timezoneId: "America/Los_Angeles",
});
test("mobile positions, strikes, presets and deferred PDF", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8787/collar");
  await expect(page.locator('[data-key="asOf"]')).toHaveCount(0);
  await expect(page.locator("#valuation-stamp")).toContainText("As of");
  const first = page.locator("details").first();
  await expect(first.locator(".results")).toContainText("200 contracts");
  await expect(
    first.locator("tbody").first().locator("tr").first(),
  ).toContainText("+80.0%");
  await expect(
    first
      .locator("tbody")
      .first()
      .locator("tr")
      .first()
      .locator("td")
      .last()
      .locator("span"),
  ).toHaveClass("negative");
  const slider = first.locator('[data-strike="put"]');
  await slider.focus();
  const before = await first.locator('[data-key="put"]').inputValue();
  await page.keyboard.press("ArrowRight");
  await expect(first.locator('[data-key="put"]')).not.toHaveValue(before);
  await expect(first.locator('[data-strike-output="put"]')).toContainText(
    "% vs. stock",
  );
  expect(await slider.evaluate((el) => getComputedStyle(el).accentColor)).toBe(
    "rgb(173, 136, 76)",
  );
  await expect(first).not.toContainText("Snaps to");
  const mobileInput = await first.locator(".position-inputs").boundingBox(),
    mobileResults = await first.locator(".results").boundingBox();
  expect(mobileResults.y).toBeGreaterThan(mobileInput.y + mobileInput.height);
  await first.locator("summary").click();
  await page.getByRole("button", { name: "Add position", exact: true }).click();
  const second = page.locator("details").nth(1);
  await second.locator('[data-key="symbol"]').fill("MSFT");
  await second.locator('[data-key="symbol"]').blur();
  await second.locator('[data-key="strategy"]').selectOption("yield");
  await expect(second.locator(".results")).toContainText(
    "disjoint share tranches",
  );
  await expect(second.locator('[data-key="delta"]')).toHaveValue("0.2");
  await second.locator('[data-key="preset"]').selectOption("ladder");
  await expect(second.locator("fieldset")).toHaveCount(3);
  await second.locator('[data-key="years"]').fill("4");
  await second.locator('[data-key="years"]').blur();
  await expect(second.locator("fieldset")).toHaveCount(4);
  await second.locator('[data-key="preset"]').selectOption("income");
  await second.locator('[data-key="income"]').fill("100000000");
  await second.locator('[data-key="income"]').blur();
  await expect(second.locator(".results")).toContainText("Target shortfall");
  await page.getByRole("button", { name: "Add position", exact: true }).click();
  const third = page.locator("details").nth(2);
  await third.locator('[data-key="strategy"]').selectOption("borrow");
  await expect(third.locator(".results")).toContainText("placeholder");
  await expect(page.locator("#build")).toBeDisabled();
  await expect(page.locator("#proposal")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "../mobile-proposal.png", fullPage: true });
  await first.locator("summary").click();
  await expect(first.locator('[data-key="put"]')).not.toHaveValue(before);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const inputs = await first.locator(".position-inputs").boundingBox(),
    results = await first.locator(".results").boundingBox();
  expect(inputs.x + inputs.width).toBeLessThan(results.x);
  expect(Math.abs(inputs.y - results.y)).toBeLessThan(2);
  expect(
    await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(247, 248, 250)");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../restored-desktop.png" });
  await page.screenshot({ path: "../desktop-proposal.png", fullPage: true });
});

test("today replaces valuation input and rolls forward overnight", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-31T06:59:00Z") });
  await page.goto("/collar");
  await expect(page.locator("#valuation-stamp")).toContainText("Oct 30, 2026");
  await expect(page.locator('[data-key="asOf"]')).toHaveCount(0);
  const before = await page
    .locator(".results .table-card")
    .last()
    .textContent();
  await page.clock.runFor(120000);
  await expect(page.locator("#valuation-stamp")).toContainText("Oct 31, 2026");
  expect(
    await page.locator(".results .table-card").last().textContent(),
  ).not.toBe(before);
  const call = page.locator('[data-key="call"]');
  await call.selectOption({ index: 1 });
  await expect(page.locator('[data-strike-output="call"]')).toContainText(
    await call.inputValue(),
  );
  await page.screenshot({ path: "../restored-mobile.png", fullPage: true });
});
