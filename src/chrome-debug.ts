import { cdpAvailable, ensureChromeDebugging, listCdpTargets } from "./chrome-cdp.js";

async function main(): Promise<void> {
  if (await cdpAvailable()) {
    const targets = await listCdpTargets().catch(() => []);
    const wa = targets.find((t) => t.url.includes("web.whatsapp.com"));
    process.stdout.write(
      `Chrome debugging is already on.\nWhatsApp tab: ${wa ? wa.url : "not open yet — opening is handled by the agent."}\nLeave this Chrome window running, then: npm run agent\n`,
    );
    return;
  }

  const url = await ensureChromeDebugging();
  process.stdout.write(
    `Started Chrome with DevTools at ${url}\nConfirm WhatsApp Web is logged in in that window, then run: npm run agent\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
