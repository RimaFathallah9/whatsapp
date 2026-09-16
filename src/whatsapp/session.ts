import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { launchWhatsAppChrome } from "../chrome-launch.js";

export type WhatsAppSession = {
  browser: Browser | null;
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
        "WhatsApp Web is showing a QR code. The copied Chrome profile is not logged in. Close Chrome, make sure WhatsApp Web works in the your chrome account, then run .\\agent.cmd again.",
      );
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out waiting for WhatsApp Web to finish loading.");
}

export async function connectWhatsApp(): Promise<WhatsAppSession> {
  const { context, page } = await launchWhatsAppChrome();
  await waitForWhatsAppReady(page);
  return {
    browser: null,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}
