import { launchWhatsAppChrome } from "./chrome-launch.js";

async function main(): Promise<void> {
  const { context, page } = await launchWhatsAppChrome();
  process.stdout.write(`WhatsApp tab: ${page.url()}\n`);
  process.stdout.write("Chrome is open. Press Ctrl+C when you are done.\n");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  await context.close().catch(() => undefined);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
