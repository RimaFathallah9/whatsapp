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
  const launched = await launchWhatsAppChrome();
  let page = launched.page;
  const whatsapp = launched.context.pages().find((p) => p.url().includes("web.whatsapp.com"));
  if (whatsapp) page = whatsapp;
  await waitForWhatsAppReady(page);
  return {
    browser: null,
    context: launched.context,
    page,
    close: async () => {
      await launched.context.close().catch(() => undefined);
    },
  };
}
