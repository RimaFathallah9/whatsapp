function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pane() {
  return (
    document.querySelector("#pane-side") ||
    document.querySelector("[aria-label='Chat list']") ||
    document.querySelector("[data-testid='chat-list']")
  );
}

function scrapeChatList() {
  const root = pane();
  if (!root) return [];

  const rows = Array.from(root.querySelectorAll('[role="listitem"], [role="row"]'));
  const chats = [];
  for (const row of rows.slice(0, 40)) {
    const text = (row.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (text.length < 2) continue;
    const unread = Boolean(
      row.querySelector('[aria-label*="unread" i], [data-testid="icon-unread-count"]') ||
        /unread/i.test(row.getAttribute("aria-label") || ""),
    );
    const timeIdx = text.findIndex((line) =>
      /^\d{1,2}:\d{2}(\s*(AM|PM))?$|^yesterday$|^today$|^hoy$|^ayer$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^mon$|^tue$|^wed$|^thu$|^fri$|^sat$|^sun$/i.test(
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
}

function scrapeOpenMessages() {
  const nodes = Array.from(document.querySelectorAll("div.copyable-text[data-pre-plain-text]"));
  return nodes.slice(-40).map((node) => {
    const prePlain = node.getAttribute("data-pre-plain-text") || "";
    const text = (node.innerText || "").trim();
    const row = node.closest("[data-id]") || node.closest("div[role='row']");
    const fromMe = Boolean(
      row?.querySelector(".message-out") ||
        node.closest(".message-out") ||
        /message-out/.test(row?.className || "") ||
        (prePlain.startsWith("[") && /\]\s*You:/i.test(prePlain)),
    );
    return { fromMe, sender: "", text, timeLabel: "", prePlain };
  });
}

function openContactName() {
  const header = document.querySelector("#main header, [data-testid='conversation-header']");
  if (!header) return "";
  const titled = header.querySelector("span[title], [data-testid='conversation-info-header-chat-title']");
  return (titled?.getAttribute("title") || titled?.textContent || header.innerText || "").split("\n")[0].trim();
}

function parseClockToday(label) {
  const match = String(label || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  const ts = new Date();
  ts.setHours(hours, minutes, 0, 0);
  if (ts.getTime() > Date.now() + 60_000) ts.setDate(ts.getDate() - 1);
  return ts.getTime();
}

function clickChat(contact) {
  const root = pane();
  if (!root) return false;
  const titled = Array.from(root.querySelectorAll("span[title]")).find(
    (el) => (el.getAttribute("title") || "") === contact,
  );
  if (titled) {
    titled.click();
    return true;
  }
  const row = Array.from(root.querySelectorAll('[role="listitem"], [role="row"]')).find((el) =>
    (el.innerText || "").includes(contact),
  );
  if (row) {
    row.click();
    return true;
  }
  return false;
}

function toConversation(chat, messages, now) {
  const timestamp = parseClockToday(chat.timeLabel) || now;
  const msgs =
    messages && messages.length
      ? messages
          .filter((m) => m.text)
          .map((m) => ({
            fromMe: m.fromMe,
            sender: m.fromMe ? "Me" : chat.contact,
            text: m.text,
            timestamp,
            timeLabel: chat.timeLabel,
          }))
      : [
          {
            fromMe: false,
            sender: chat.contact,
            text: chat.preview,
            timestamp,
            timeLabel: chat.timeLabel,
          },
        ];
  const last = msgs[msgs.length - 1];
  return {
    contact: chat.contact,
    chatId: chat.contact,
    isGroup: chat.isGroup,
    lastTimestamp: last?.timestamp || timestamp,
    lastPreview: last?.text || chat.preview,
    unread: chat.unread,
    messages: msgs,
  };
}

async function scan(lookbackMinutes = 30) {
  if (!pane()) {
    return { error: "WhatsApp chat list is not visible yet. Wait until chats appear, then click the extension again." };
  }

  const now = Date.now();
  const list = scrapeChatList();
  if (list.length === 0) {
    return { error: "No chats found in the list. Leave WhatsApp Web open on the chat list." };
  }

  const recent = list.filter((chat) => {
    const ts = parseClockToday(chat.timeLabel);
    if (ts) return now - ts <= lookbackMinutes * 60_000 + 30_000;
    if (!chat.timeLabel || /today|hoy/i.test(chat.timeLabel)) return true;
    return chat.unread;
  });
  const candidates = (recent.length ? recent : list).slice(0, 12);
  const conversations = [];
  const alreadyOpen = openContactName();
  const openMessages = scrapeOpenMessages();
  const toOpen = candidates.filter((chat) => chat.unread || chat.contact === alreadyOpen).slice(0, 6);

  for (const chat of candidates) {
    let messages = [];
    if (alreadyOpen && chat.contact === alreadyOpen) {
      messages = openMessages;
    } else if (toOpen.some((item) => item.contact === chat.contact)) {
      if (clickChat(chat.contact)) {
        await sleep(450);
        messages = scrapeOpenMessages();
      }
    }
    conversations.push(toConversation(chat, messages, now));
  }

  return { conversations, scannedAt: new Date().toISOString() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN") return;
  scan(message.lookbackMinutes)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
