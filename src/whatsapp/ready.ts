import type { Page } from "playwright-core";
import { isTransientPageError } from "./page-utils.js";

export async function isQrVisible(page: Page): Promise<boolean> {
  const qr = page.locator(
    "canvas[aria-label*='QR' i], div[data-testid='qrcode'], [aria-label*='Scan this QR' i]",
  );
  return (await qr.count()) > 0 && (await qr.first().isVisible().catch(() => false));
}

export async function waitForWhatsAppReady(page: Page): Promise<void> {
  const deadline = Date.now() + 180000;
  let stableSince = 0;

  while (Date.now() < deadline) {
    try {
      if (await isQrVisible(page)) {
        throw new Error(
          "WhatsApp Web is showing a QR code. Close Chrome, open WhatsApp Web in the your chrome account until the chat list appears, then run .\\agent.cmd again.",
        );
      }

      const cells = page.locator(
        '#pane-side span[title], #pane-side [role="listitem"], #pane-side [role="row"]',
      );
      const count = await cells.count();
      if (count > 0) {
        if (!stableSince) {
          process.stdout.write("Chat list appeared, waiting for WhatsApp to finish loading...\n");
          stableSince = Date.now();
        }
        if (Date.now() - stableSince >= 5000) {
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          await page.waitForTimeout(1000);
          return;
        }
      } else {
        stableSince = 0;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("QR code")) throw error;
      if (!isTransientPageError(error)) throw error;
      stableSince = 0;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error(
    "Timed out waiting for the WhatsApp chat list. Leave the Chrome window open until chats are visible, then run .\\agent.cmd again.",
  );
}
