import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { ensureChromeDebugging } from "../chrome-cdp.js";

export type WhatsAppSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

async function isLoggedIn(page: Page): Promise<boolean> {
  const pane = page.locator("#pane-side, [aria-label='Chat list'], [data-testid='chat-list']");
  return (await pane.count()) > 0 && (await pane.first().isVisible().catch(() => false));
}

async function isQrVisible(page: Page): Promise<boolean> {
  const qr = page.locator(
    "canvas[aria-label*='QR' i], div[data-testid='qrcode'], [aria-label*='Scan this QR' i]",
  );
  return (await qr.count()) > 0 && (await qr.first().isVisible().catch(() => false));
}

async function waitForWhatsAppReady(page: Page): Promise<void> {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await isLoggedIn(page)) return;
    if (await isQrVisible(page)) {
      throw new Error(
        "WhatsApp Web is showing a QR code. This laptop session is logged out. Re-open the Chrome window where you were already logged in, then rerun the agent.",
      );
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out waiting for WhatsApp Web to finish loading.");
}

async function findWhatsAppPage(context: BrowserContext): Promise<Page> {
  for (const page of context.pages()) {
    if (page.url().includes("web.whatsapp.com")) return page;
  }
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
  return page;
}

export async function connectWhatsApp(): Promise<WhatsAppSession> {
  const cdpUrl = await ensureChromeDebugging();
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await findWhatsAppPage(context);
  if (!page.url().includes("web.whatsapp.com")) {
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
  }
  await waitForWhatsAppReady(page);

  return {
    browser,
    context,
    page,
    close: async () => {
      // Keep the user's Chrome / WhatsApp Web window open.
    },
  };
}
