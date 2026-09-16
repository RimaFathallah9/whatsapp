import { type Browser, type BrowserContext, type Page } from "playwright-core";
import { launchWhatsAppChrome } from "../chrome-launch.js";
import { waitForWhatsAppReady } from "./ready.js";

export type WhatsAppSession = {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

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
