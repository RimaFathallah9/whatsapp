import type { Page } from "playwright-core";

export async function isQrVisible(page: Page): Promise<boolean> {
  const qr = page.locator(
    "canvas[aria-label*='QR' i], div[data-testid='qrcode'], [aria-label*='Scan this QR' i], [data-ref]",
  );
  return (await qr.count()) > 0 && (await qr.first().isVisible().catch(() => false));
}

export async function waitForWhatsAppReady(page: Page): Promise<void> {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await isQrVisible(page)) {
      throw new Error(
        "WhatsApp Web is showing a QR code. Close Chrome, open WhatsApp Web in the your chrome account until the chat list appears, then run .\\agent.cmd again.",
      );
    }

    const cells = page.locator(
      '#pane-side span[title], #pane-side [role="listitem"], #pane-side [role="row"]',
    );
    if ((await cells.count()) > 0) {
      await page.waitForTimeout(1500);
      return;
    }

    await page.waitForTimeout(1000);
  }
  throw new Error("Timed out waiting for the WhatsApp chat list. Leave the Chrome window open until chats are visible, then run .\\agent.cmd again.");
}
