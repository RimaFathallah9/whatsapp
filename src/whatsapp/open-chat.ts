import type { Page } from "playwright-core";

function chatRows(page: Page) {
  return page.locator(
    '#pane-side [role="listitem"], #pane-side [role="row"], [aria-label="Chat list"] [role="listitem"]',
  );
}

export async function openChat(page: Page, contact: string): Promise<boolean> {
  try {
    const header = page.locator("#main header, [data-testid='conversation-header']");
    if ((await header.count()) > 0) {
      const title = ((await header.innerText().catch(() => "")) || "").toLowerCase();
      if (title.includes(contact.toLowerCase().slice(0, 18))) return true;
    }

    const titled = page.locator("#pane-side").locator(`span[title="${contact}"]`).first();
    if ((await titled.count()) > 0 && (await titled.isVisible().catch(() => false))) {
      await titled.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      return true;
    }

    const row = chatRows(page).filter({ hasText: contact }).first();
    if ((await row.count()) > 0) {
      await row.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      return true;
    }

    const searchBtn = page
      .locator(
        '[data-icon="search-refreshed"], [data-icon="search"], [aria-label="Search"], [aria-label="Buscar"], [aria-label*="Search" i]',
      )
      .first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForTimeout(400);
    }

    const search = page
      .locator(
        '[aria-label="Search input textbox"], [aria-label="Cuadro de texto para búsqueda"], [data-testid="chat-list-search"], #side div[contenteditable="true"], div[contenteditable="true"][data-tab="3"]',
      )
      .first();
    if (!(await search.isVisible().catch(() => false))) return false;

    await search.click({ timeout: 5000 });
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(contact, { delay: 15 });
    await page.waitForTimeout(800);

    const result = chatRows(page).first();
    if ((await result.count()) === 0) return false;
    await result.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}
