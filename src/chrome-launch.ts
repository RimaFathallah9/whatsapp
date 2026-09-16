import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { chromePath, chromeUserDataDir, envString } from "./config.js";

export const ATTACH_VERSION = "CHROME_ATTACH_V5";

export type ChromeAccount = {
  dir: string;
  name: string;
  email: string;
  signedIn: boolean;
  active: number;
};

export function debugUserDataDir(): string {
  return path.join(process.env.LOCALAPPDATA || "", "WhatsAppInboxAgent", "Chrome");
}

function realUserDataDir(): string {
  const fromEnv = chromeUserDataDir();
  if (fromEnv) return fromEnv;
  throw new Error("Chrome user data folder was not found.");
}

export function listChromeAccounts(userData = realUserDataDir()): ChromeAccount[] {
  const localStatePath = path.join(userData, "Local State");
  if (!fs.existsSync(localStatePath)) return [];
  const state = JSON.parse(fs.readFileSync(localStatePath, "utf8")) as {
    profile?: { info_cache?: Record<string, Record<string, unknown>> };
  };
  const cache = state.profile?.info_cache ?? {};
  const accounts: ChromeAccount[] = [];
  for (const [dir, value] of Object.entries(cache)) {
    if (dir === "Guest Profile" || dir === "System Profile") continue;
    const email = String(value.user_name ?? "");
    accounts.push({
      dir,
      name: String(value.name ?? ""),
      email,
      signedIn: Boolean(email.trim()),
      active: Number(value.active_time ?? 0),
    });
  }
  return accounts;
}

export function resolveYourChromeProfile(accounts = listChromeAccounts()): ChromeAccount {
  const want = (envString("CHROME_PROFILE_NAME") || "your chrome").toLowerCase().trim();
  const matches = accounts.filter((account) => {
    const hay = `${account.name} ${account.dir} ${account.email}`.toLowerCase();
    return account.dir.toLowerCase() === want || hay.includes(want);
  });
  matches.sort((a, b) => Number(b.signedIn) - Number(a.signedIn) || b.active - a.active);
  const chosen = matches.find((account) => account.signedIn) || matches[0];
  if (!chosen) {
    const listed = accounts.map((a) => `${a.dir} = ${a.name}`).join(", ");
    throw new Error(`Could not find Chrome account '${want}'. Found: ${listed || "none"}`);
  }
  return chosen;
}

function sleep(ms: number): void {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  spawnSync("cmd.exe", ["/c", `ping 127.0.0.1 -n ${seconds + 1} >nul`], {
    windowsHide: true,
  });
}

export function killChrome(): void {
  spawnSync("taskkill", ["/F", "/IM", "chrome.exe", "/T"], { stdio: "ignore", windowsHide: true });
  spawnSync("taskkill", ["/F", "/IM", "crashpad_handler.exe", "/T"], { stdio: "ignore", windowsHide: true });
  sleep(2000);
}

function removeLocks(root: string): void {
  const names = ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile", "DevToolsActivePort"];
  for (const name of names) {
    try {
      fs.unlinkSync(path.join(root, name));
    } catch {
      // ignore
    }
  }
}

export function copyProfileForDebug(profileDir: string): string {
  const srcRoot = realUserDataDir();
  const destRoot = debugUserDataDir();
  const srcProfile = path.join(srcRoot, profileDir);
  const destProfile = path.join(destRoot, profileDir);
  if (!fs.existsSync(srcProfile)) {
    throw new Error(`Chrome profile folder not found: ${srcProfile}`);
  }

  fs.mkdirSync(destRoot, { recursive: true });
  process.stdout.write(`Copying ${profileDir} to ${destRoot} (keeps WhatsApp login)...\n`);

  const copied = spawnSync(
    "robocopy",
    [
      srcProfile,
      destProfile,
      "/E",
      "/XO",
      "/R:1",
      "/W:1",
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/NC",
      "/NS",
      "/NP",
      "/XD",
      "Cache",
      "Code Cache",
      "GPUCache",
      "Crashpad",
      "ShaderCache",
      "/XF",
      "SingletonLock",
      "SingletonSocket",
      "SingletonCookie",
      "DevToolsActivePort",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const code = copied.status ?? 0;
  if (code >= 8) {
    throw new Error(`Could not copy Chrome profile (robocopy ${code}). ${copied.stderr || copied.stdout || ""}`);
  }

  const localState = path.join(srcRoot, "Local State");
  if (fs.existsSync(localState)) {
    fs.copyFileSync(localState, path.join(destRoot, "Local State"));
  }
  fs.writeFileSync(path.join(destRoot, "agent-profile.txt"), profileDir);
  removeLocks(destRoot);
  removeLocks(destProfile);
  return destRoot;
}

export async function launchWhatsAppChrome(): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  process.stdout.write(`${ATTACH_VERSION}\n`);
  const accounts = listChromeAccounts();
  process.stdout.write("Detected Chrome accounts:\n");
  for (const account of accounts) {
    const who = account.email || "local / not signed in";
    process.stdout.write(`  ${account.dir.padEnd(14)} ${account.name}  (${who})\n`);
  }

  const account = resolveYourChromeProfile(accounts);
  process.stdout.write(`\nOpening: ${account.name}  [${account.dir}]  ${account.email}\n`);

  killChrome();
  const userDataDir = copyProfileForDebug(account.dir);
  const exe = chromePath();
  if (!exe) throw new Error("Chrome was not found.");

  process.stdout.write(`Playwright launching Chrome with user-data-dir=${userDataDir}\n`);
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: exe,
    headless: false,
    viewport: null,
    args: [
      `--profile-directory=${account.dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=ProfilePickerOnStartup",
    ],
    timeout: 60000,
  });

  let page = context.pages().find((p) => p.url().includes("web.whatsapp.com")) ?? context.pages()[0];
  if (!page) page = await context.newPage();
  if (!page.url().includes("web.whatsapp.com")) {
    await page.goto("https://web.whatsapp.com", { waitUntil: "commit", timeout: 60000 });
  }
  process.stdout.write("Waiting for WhatsApp chat list...\n");
  return { context, page };
}

export function spawnChromeDetached(profileDir: string): void {
  const exe = chromePath();
  if (!exe) throw new Error("Chrome was not found.");
  const userDataDir = debugUserDataDir();
  const args = [
    "--remote-debugging-port=9222",
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    `--profile-directory=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=ProfilePickerOnStartup",
    "https://web.whatsapp.com",
  ];
  process.stdout.write(`Spawn: ${exe} ${args.join(" ")}\n`);
  const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}
