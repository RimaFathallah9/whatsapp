import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromePath, envInt, envString } from "./config.js";

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

export function chromeDebugUserDataDir(): string {
  const localApp = process.env.LOCALAPPDATA || "";
  return path.join(localApp, "WhatsAppInboxAgent", "Chrome");
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
    `Chrome DevTools is not reachable at ${cdpBase()}. Close Chrome fully, then run: .\\chrome.cmd`,
  );
}

export function launchChromeWithDebugging(): void {
  const exe = chromePath();
  if (!exe) {
    throw new Error("Chrome/Edge was not found. Set CHROME_PATH to chrome.exe.");
  }

  const port = envInt("CHROME_DEBUG_PORT", 9222);
  const debugDir = chromeDebugUserDataDir();
  const marker = path.join(debugDir, "agent-profile.txt");
  const profile =
    envString("CHROME_PROFILE") ||
    (fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "") ||
    "Profile 1";
  if (!fs.existsSync(debugDir)) {
    throw new Error("Run .\\chrome.cmd first so the your-chrome debug profile can be created.");
  }

  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--user-data-dir=${debugDir}`,
    `--profile-directory=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=ProfilePickerOnStartup",
    "https://web.whatsapp.com",
  ];

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
      `${error instanceof Error ? error.message : String(error)}\n\nRun only .\\chrome.cmd first, wait until WhatsApp Web loads, then .\\agent.cmd.`,
    );
  }
}
