import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs";
test.use({ viewport: { width: 390, height: 844 } });
test("mobile positions, strikes, presets, unsupported selection and research PDF", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8787/collar");
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
  await page
    .getByRole("button", { name: "Build Proposal", exact: true })
    .click();
  await expect(page.locator('[data-include="2"]')).toBeDisabled();
  const fixture = await PDFDocument.create();
  for (let i = 1; i <= 14; i++)
    fixture.addPage().drawText("TEST FIXTURE ONLY - PAGE " + i);
  await page.locator("#deck").setInputFiles({
    name: "test-fixture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await fixture.save()),
  });
  await page.locator("#protection-page").fill("3");
  await page.locator("#yield-page").fill("9");
  await page.locator("#verified").check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download research PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs("../fixture-proposal.pdf");
  const pdf = await PDFDocument.load(
    fs.readFileSync("../fixture-proposal.pdf"),
  );
  expect(pdf.getPageCount()).toBe(8);
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
  await page.screenshot({ path: "../desktop-proposal.png", fullPage: true });
});
