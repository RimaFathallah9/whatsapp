import type { Page } from "playwright-core";
import { openChat } from "./open-chat.js";

async function composer(page: Page) {
  const locators = [
    page.locator('footer div[contenteditable="true"][data-tab="10"]'),
    page.locator('footer div[contenteditable="true"]'),
    page.locator('[aria-label="Type a message"]'),
    page.locator('[data-testid="conversation-compose-box-input"]'),
  ];
  for (const loc of locators) {
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
      return loc.first();
    }
  }
  return locators[1].first();
}

export async function sendWhatsAppMessage(
  page: Page,
  contact: string,
  text: string,
): Promise<void> {
  const opened = await openChat(page, contact);
  if (!opened) {
    throw new Error(`Could not open chat with ${contact}`);
  }

  const box = await composer(page);
  await box.click({ timeout: 8000 });
  const inserted = await page.evaluate((value) => {
    const el = document.querySelector(
      "footer div[contenteditable='true']",
    ) as HTMLElement | null;
    if (!el) return false;
    el.focus();
    const ok = document.execCommand("insertText", false, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return ok || (el.innerText || "").includes(value.slice(0, 12));
  }, text);

  if (!inserted) {
    await box.fill(text).catch(async () => {
      await page.keyboard.type(text, { delay: 15 });
    });
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}
