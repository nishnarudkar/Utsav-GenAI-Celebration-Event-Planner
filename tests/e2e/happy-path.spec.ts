import { expect, test, type Page } from "@playwright/test";

async function setGuests(page: Page, guests: string) {
  const input = page.getByLabel("Guest count");
  await input.fill(guests);
  await input.press("Enter");
}

test("onboarding builds a plan, and changing the guest count shows the diff", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Wedding", exact: true }).click();
  await page.getByRole("button", { name: "Bengali Hindu" }).click();
  await page.getByRole("button", { name: "Kolkata" }).click();
  await page.getByLabel("Main day").fill("2027-02-14");
  await page.getByRole("button", { name: "Send answer" }).click();
  await page.getByRole("button", { name: "250", exact: true }).click();
  await page.getByRole("button", { name: "₹15L", exact: true }).click();

  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("wedding in Kolkata");
  await expect(page.getByText("₹14.4L").first()).toBeVisible();

  await setGuests(page, "350");
  await expect(page.getByText("What changed")).toBeVisible();
  await expect(page.getByText("+₹2.1L more in total")).toBeVisible();
  await expect(page.getByText("Over budget by ₹1.5L")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone")).toBeVisible();
  await expect(page.getByText("₹14.4L").first()).toBeVisible();
});

test("the demo script works from start to finish", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo wedding" }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);

  // Timeline: rituals with their source.
  await page.getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByText("Gaye Holud", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Source:/).first()).toBeVisible();

  // Mom adds 100 guests: two conflicts, three fixes, and one is applied.
  await page.getByRole("link", { name: "Overview" }).click();
  await setGuests(page, "350");
  await expect(page.getByText("the venue holds 300").first()).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).nth(1).click();
  await expect(page.getByText("Over budget by ₹54.2K").first()).toBeVisible();

  // Family Council: choose a compromise and see the plan change.
  await page.getByRole("link", { name: "Family" }).click();
  await page.getByRole("button", { name: "Hold the council" }).click();
  await expect(page.getByText("Where the family differs")).toBeVisible();
  await page.getByRole("button", { name: /^Choose:/ }).first().click();
  await expect(page.getByText(/Family Council chose/)).toBeVisible();

  // Quote X-Ray: the seeded quote, a real upload through the file picker, and Copy.
  await page.getByRole("link", { name: "Vendors" }).click();
  await expect(page.getByText("Checked quotes")).toBeVisible();
  const quoteCards = page.getByText("sample-caterer-quote.pdf");
  await expect(quoteCards).toHaveCount(1);
  await page.getByLabel(/Photo or PDF/).setInputFiles("public/samples/sample-caterer-quote.pdf");
  await page.getByRole("button", { name: "Check this quote" }).click();
  await expect(quoteCards).toHaveCount(2);
  await page.getByRole("button", { name: /copy/i }).first().click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
});

test("the plan downloads as a PDF and a calendar file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo wedding" }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);

  for (const [link, file] of [["Download PDF", "utsav-ananya-rohan-s-wedding.pdf"], ["Add to calendar", "utsav-ananya-rohan-s-wedding.ics"]] as const) {
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: link }).click();
    expect((await download).suggestedFilename()).toBe(file);
  }
});
