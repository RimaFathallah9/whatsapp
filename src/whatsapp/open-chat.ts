import type { Page } from "playwright-core";

export async function openChat(page: Page, contact: string): Promise<boolean> {
  const header = page.locator("#main header, [data-testid='conversation-header']");
  if ((await header.count()) > 0) {
    const title = ((await header.innerText().catch(() => "")) || "").toLowerCase();
    if (title.includes(contact.toLowerCase().slice(0, 18))) return true;
  }

  const searchSelectors = [
    '[aria-label="Search input textbox"]',
    '[data-testid="chat-list-search"]',
    'div[contenteditable="true"][data-tab="3"]',
  ];

  let search = page.locator(searchSelectors.join(", ")).first();
  if ((await search.count()) === 0) {
    const searchBtn = page
      .locator('[data-icon="search-refreshed"], [aria-label="Search"], [data-icon="search"]')
      .first();
    if (await searchBtn.count()) await searchBtn.click();
    search = page.locator(searchSelectors.join(", ")).first();
  }

  await search.waitFor({ state: "visible", timeout: 8000 });
  await search.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(contact, { delay: 15 });
  await page.waitForTimeout(600);

  const result = page.locator("#pane-side [role='listitem'], #pane-side [role='row']").first();
  if ((await result.count()) === 0) return false;
  await result.click();
  await page.waitForTimeout(500);
  return true;
}
