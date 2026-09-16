import type { Page } from "playwright-core";
import type { ChatMessage, Conversation } from "../types.js";
import { openChat } from "./open-chat.js";
import { withPageRetry } from "./page-utils.js";

type RawChat = {
  contact: string;
  preview: string;
  timeLabel: string;
  unread: boolean;
  isGroup: boolean;
};

type RawMessage = {
  fromMe: boolean;
  sender: string;
  text: string;
  timeLabel: string;
  prePlain: string;
};

function parseClockToday(label: string, now: Date): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  const ts = new Date(now);
  ts.setHours(hours, minutes, 0, 0);
  if (ts.getTime() > now.getTime() + 60_000) ts.setDate(ts.getDate() - 1);
  return ts.getTime();
}

function parsePrePlain(pre: string): { timestamp: number; sender: string } | null {
  const match = pre.match(/\[([^\]]+)\]\s*(.*?):?\s*$/);
  if (!match) return null;
  const stamp = match[1];
  const sender = match[2]?.trim() || "";
  const parsed = Date.parse(stamp.replace(",", ""));
  if (Number.isFinite(parsed)) return { timestamp: parsed, sender };

  const dmy = stamp.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:AM|PM)?,?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (dmy) {
    const year = dmy[6].length === 2 ? 2000 + Number(dmy[6]) : Number(dmy[6]);
    const date = new Date(year, Number(dmy[5]) - 1, Number(dmy[4]), Number(dmy[1]), Number(dmy[2]), Number(dmy[3] || 0));
    return { timestamp: date.getTime(), sender };
  }
  return { timestamp: Date.now(), sender };
}

function withinLookback(timestamp: number, lookbackMinutes: number, now: number): boolean {
  return now - timestamp <= lookbackMinutes * 60_000 + 30_000;
}

async function scrapeChatList(page: Page): Promise<RawChat[]> {
  return withPageRetry(page, () => page.evaluate(() => {
    const root =
      document.querySelector("#pane-side") ||
      document.querySelector("[aria-label='Chat list']") ||
      document.querySelector("[data-testid='chat-list']");
    if (!root) return [];

    const rows = Array.from(
      root.querySelectorAll('[role="listitem"], [role="row"]'),
    ) as HTMLElement[];

    const chats: RawChat[] = [];
    for (const row of rows.slice(0, 40)) {
      const text = (row.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (text.length < 2) continue;
      const unread = Boolean(
        row.querySelector('[aria-label*="unread" i], [data-testid="icon-unread-count"]') ||
          /unread/i.test(row.getAttribute("aria-label") || ""),
      );
      const timeIdx = text.findIndex((line) =>
        /^\d{1,2}:\d{2}(\s*(AM|PM))?$|^yesterday$|^today$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^mon$|^tue$|^wed$|^thu$|^fri$|^sat$|^sun$/i.test(
          line,
        ),
      );
      const contact = text[0] || "Unknown";
      const timeLabel = timeIdx >= 0 ? text[timeIdx] : "";
      const preview = text.filter((_, i) => i !== 0 && i !== timeIdx).join(" · ").slice(0, 240);
      const aria = (row.getAttribute("aria-label") || "").toLowerCase();
      chats.push({
        contact,
        preview,
        timeLabel,
        unread,
        isGroup: aria.includes("group") || /members|participants/i.test(preview),
      });
    }
    return chats;
  }));
}

async function scrapeOpenMessages(page: Page): Promise<RawMessage[]> {
  return withPageRetry(page, () => page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("div.copyable-text[data-pre-plain-text]")) as HTMLElement[];
    return nodes.slice(-40).map((node) => {
      const prePlain = node.getAttribute("data-pre-plain-text") || "";
      const text = (node.innerText || "").trim();
      const row = node.closest("[data-id]") || node.closest("div[role='row']");
      const fromMe = Boolean(
        row?.querySelector(".message-out") ||
          node.closest(".message-out") ||
          /message-out/.test(row?.className || "") ||
          prePlain.startsWith("[") && /\]\s*You:/i.test(prePlain),
      );
      const time =
        (row?.querySelector("span[data-pre-plain-text]") as HTMLElement | null)?.innerText ||
        "";
      return {
        fromMe,
        sender: "",
        text,
        timeLabel: time,
        prePlain,
      };
    });
  }));
}

function toMessages(raw: RawMessage[], contact: string, now: Date): ChatMessage[] {
  return raw
    .map((item) => {
      const parsed = parsePrePlain(item.prePlain);
      const timestamp =
        parsed?.timestamp ||
        parseClockToday(item.timeLabel, now) ||
        Date.now();
      const sender = item.fromMe ? "Me" : parsed?.sender || contact;
      return {
        fromMe: item.fromMe || /^you$/i.test(parsed?.sender || ""),
        sender,
        text: item.text,
        timestamp,
        timeLabel: item.timeLabel || parsed?.sender || "",
      };
    })
    .filter((msg) => msg.text);
}

export async function readRecentConversations(
  page: Page,
  lookbackMinutes: number,
): Promise<Conversation[]> {
  const now = new Date();
  const nowMs = now.getTime();

  let list = await scrapeChatList(page);
  if (list.length === 0) {
    await page.waitForTimeout(3000);
    list = await scrapeChatList(page);
  }

  const conversations: Conversation[] = [];
  const candidates = list.filter((chat) => {
    const ts = parseClockToday(chat.timeLabel, now);
    if (ts) return withinLookback(ts, lookbackMinutes, nowMs);
    if (!chat.timeLabel || /today|hoy/i.test(chat.timeLabel)) return true;
    return chat.unread;
  });

  const toOpen = candidates.length > 0 ? candidates : list.slice(0, 12);

  for (const chat of toOpen) {
    const opened = await openChat(page, chat.contact);
    const raw = opened ? await scrapeOpenMessages(page) : [];
    let messages = toMessages(raw, chat.contact, now).filter((msg) =>
      withinLookback(msg.timestamp, lookbackMinutes, nowMs),
    );
    if (messages.length === 0) {
      messages = toMessages(raw, chat.contact, now).slice(-8);
    }
    if (messages.length === 0 && chat.preview) {
      messages = [
        {
          fromMe: false,
          sender: chat.contact,
          text: chat.preview,
          timestamp: parseClockToday(chat.timeLabel, now) || nowMs,
          timeLabel: chat.timeLabel,
        },
      ];
    }
    const last = messages[messages.length - 1];
    conversations.push({
      contact: chat.contact,
      chatId: chat.contact,
      isGroup: chat.isGroup,
      lastTimestamp: last?.timestamp || parseClockToday(chat.timeLabel, now) || nowMs,
      lastPreview: last?.text || chat.preview,
      unread: chat.unread,
      messages,
    });
  }

  return conversations;
}
