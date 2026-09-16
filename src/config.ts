import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

export const ROOT = process.cwd();

export function envString(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export function envBool(name: string, fallback = false): boolean {
  const raw = envString(name);
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function envInt(name: string, fallback: number): number {
  const raw = envString(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function resolvePathMaybe(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

export function findPolicyPath(): string {
  const fromEnv = envString("POLICY_PATH");
  if (fromEnv) {
    const resolved = resolvePathMaybe(fromEnv);
    if (fs.existsSync(resolved)) return resolved;
    throw new Error(`POLICY_PATH does not exist: ${resolved}`);
  }

  const skillsDir = path.join(ROOT, "skills");
  const preferred = [
    path.join(skillsDir, "conversation-policy.md"),
    path.join(skillsDir, "skills.md"),
    path.join(skillsDir, "agent.md"),
    path.join(ROOT, "conversation-policy.md"),
  ];
  for (const file of preferred) {
    if (fs.existsSync(file)) return file;
  }

  if (fs.existsSync(skillsDir)) {
    const md = fs
      .readdirSync(skillsDir)
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .sort();
    if (md[0]) return path.join(skillsDir, md[0]);
  }

  throw new Error(
    "No policy .md file found. Put one at skills/conversation-policy.md or set POLICY_PATH.",
  );
}

export function chromePath(): string | undefined {
  const fromEnv = envString("CHROME_PATH");
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const localApp = process.env.LOCALAPPDATA || "";
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(localApp, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(localApp, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

export function chromeUserDataDir(): string | undefined {
  const fromEnv = envString("CHROME_USER_DATA");
  if (fromEnv) return fromEnv;
  const localApp = process.env.LOCALAPPDATA;
  if (!localApp) return undefined;
  const dir = path.join(localApp, "Google", "Chrome", "User Data");
  return fs.existsSync(dir) ? dir : undefined;
}

export function reportsDir(): string {
  const dir = path.join(ROOT, "reports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
