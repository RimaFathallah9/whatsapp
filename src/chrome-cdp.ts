import { spawn } from "node:child_process";
import { chromePath, chromeUserDataDir, envInt, envString } from "./config.js";

export type CdpTarget = {
  id: string;
  url: string;
  title: string;
  webSocketDebuggerUrl?: string;
  type: string;
};

function cdpBase(): string {
  return envString("CHROME_CDP_URL", `http://127.0.0.1:${envInt("CHROME_DEBUG_PORT", 9222)}`);
}

export async function cdpAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${cdpBase()}/json/version`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function listCdpTargets(): Promise<CdpTarget[]> {
  const response = await fetch(`${cdpBase()}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`CDP list failed: ${response.status}`);
  return (await response.json()) as CdpTarget[];
}

export async function waitForCdp(timeoutMs = 25000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdpAvailable()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Chrome DevTools is not reachable at ${cdpBase()}. Close Chrome fully, then run: npm run chrome`,
  );
}

export function launchChromeWithDebugging(): void {
  const exe = chromePath();
  if (!exe) {
    throw new Error("Chrome/Edge was not found. Set CHROME_PATH to chrome.exe.");
  }

  const port = envInt("CHROME_DEBUG_PORT", 9222);
  const profile = envString("CHROME_PROFILE", "Default");
  const userData = chromeUserDataDir();
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--profile-directory=${profile}`,
    "--new-window",
    "https://web.whatsapp.com",
  ];
  if (userData) args.unshift(`--user-data-dir=${userData}`);

  const child = spawn(exe, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

export async function ensureChromeDebugging(): Promise<string> {
  if (await cdpAvailable()) return cdpBase();
  launchChromeWithDebugging();
  try {
    await waitForCdp(20000);
    return cdpBase();
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nChrome is probably already running without debugging enabled. WhatsApp Web login lives in that Chrome profile, so this agent cannot open a second copy.\n\nDo this once:\n  1. Close every Chrome window (system tray too).\n  2. Run: npm run chrome\n  3. Confirm WhatsApp Web is logged in on that window.\n  4. Run: npm run agent`,
    );
  }
}
