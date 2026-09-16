import fs from "node:fs";
import path from "node:path";
import { envInt, findPolicyPath } from "../config.js";

export type PolicySettings = {
  lookbackMinutes: number;
  autoSend: boolean;
  confidenceMin: number;
  language: string;
  identity: string;
};

export type Policy = {
  filePath: string;
  markdown: string;
  body: string;
  settings: PolicySettings;
  updatedAt: string;
};

function parseScalar(raw: string): string | number | boolean {
  const value = raw.trim().replace(/^['"]|['"]$/g, "");
  if (/^(true|yes)$/i.test(value)) return true;
  if (/^(false|no)$/i.test(value)) return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: markdown };

  const data: Record<string, unknown> = {};
  let currentList: string[] | null = null;
  let currentKey = "";

  for (const line of match[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentList) {
      currentList.push(String(parseScalar(listItem[1])));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    currentKey = kv[1];
    if (kv[2] === "" || kv[2] === "|" || kv[2] === ">") {
      currentList = [];
      data[currentKey] = currentList;
    } else {
      currentList = null;
      data[currentKey] = parseScalar(kv[2]);
    }
  }

  return { data, body: match[2].trim() };
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function loadPolicy(filePath = findPolicyPath()): Policy {
  const markdown = fs.readFileSync(filePath, "utf8");
  const { data, body } = parseFrontmatter(markdown);

  return {
    filePath,
    markdown,
    body,
    updatedAt: fs.statSync(filePath).mtime.toISOString(),
    settings: {
      lookbackMinutes: asNumber(data.lookback_minutes, envInt("LOOKBACK_MINUTES", 30)),
      autoSend: asBool(data.auto_send, true),
      confidenceMin: asNumber(data.confidence_min, 0.82),
      language: String(data.language ?? "match-the-contact"),
      identity: String(data.identity ?? "first-person as me"),
    },
  };
}

export function policyName(policy: Policy): string {
  return path.basename(policy.filePath);
}
