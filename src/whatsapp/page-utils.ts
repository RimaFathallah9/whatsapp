import type { Page } from "playwright-core";

export function isTransientPageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed|Target closed|because of a navigation|frame was detached|Frame has been detached|Protocol error|Cannot find context/i.test(
    message,
  );
}

export async function withPageRetry<T>(
  page: Page,
  fn: () => Promise<T>,
  timeoutMs = 90000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw last instanceof Error ? last : new Error("WhatsApp tab closed while loading.");
    }
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isTransientPageError(error)) throw error;
      await page.waitForTimeout(1500).catch(() => undefined);
    }
  }
  throw last instanceof Error ? last : new Error("WhatsApp Web kept reloading before the agent could read it.");
}
