const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const PREVIEW = {
  top: {
    contact: "Maria Santos",
    priority: "urgent",
    theyNeed: "A same-day yes/no on whether the candidate can start Monday.",
    whatTheySaid: "Can she start Monday? Client is waiting.",
    suggestedReply:
      "I will confirm Monday start with the candidate this afternoon and come back to you with a firm yes or no before close of business.",
  },
  also: [
    {
      contact: "James Cole",
      theyNeed: "The revised commercial terms before he signs.",
    },
  ],
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderError(message, extra = "") {
  app.innerHTML = `<p class="error">${escapeHtml(message)}</p>${extra}`;
}

function renderEmpty() {
  app.innerHTML = `<p class="empty">Nothing urgent. No reply needed from you right now.</p>`;
}

function renderBriefing(result) {
  const top = result.top;
  if (!top) {
    renderEmpty();
    return;
  }

  const also = (result.also || [])
    .map(
      (item) =>
        `<p><strong>${escapeHtml(item.contact)}</strong> — ${escapeHtml(item.theyNeed)}</p>`,
    )
    .join("");

  app.innerHTML = `
    <article class="card">
      <p class="stamp">${escapeHtml((top.priority || "urgent").toUpperCase())}</p>
      <h2 class="contact">${escapeHtml(top.contact)}</h2>
      <p class="label">They need</p>
      <p class="need">${escapeHtml(top.theyNeed)}</p>
      <p class="label">They said</p>
      <p class="said">${escapeHtml(top.whatTheySaid)}</p>
      <p class="label">What you should answer</p>
      <p class="reply" id="reply">${escapeHtml(top.suggestedReply || "Draft a reply after you open the thread.")}</p>
      <button type="button" class="wide" id="copy">Copy reply</button>
    </article>
    ${
      also
        ? `<section class="also"><h2>Also waiting</h2>${also}</section>`
        : ""
    }
    ${result.warning ? `<p class="error">${escapeHtml(result.warning)}</p>` : ""}
  `;

  document.getElementById("copy")?.addEventListener("click", async () => {
    const text = top.suggestedReply || "";
    const btn = document.getElementById("copy");
    try {
      await navigator.clipboard.writeText(text);
      if (btn) btn.textContent = "Copied";
    } catch {
      if (btn) btn.textContent = "Copy failed — select the reply";
    }
  });
}

function setStatus(text) {
  app.innerHTML = `<p class="status">${escapeHtml(text)}</p>`;
}

async function findWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs[0] || null;
}

async function ensureContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

async function scan() {
  setStatus("Reading WhatsApp…");
  const tab = await findWhatsAppTab();
  if (!tab?.id) {
    renderError("Open WhatsApp Web in this Chrome profile first, then click the extension again.");
    return;
  }

  await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined);
  await ensureContent(tab.id);
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (settings?.error) {
    renderError(settings.error);
    return;
  }
  if (!settings?.apiKey) {
    renderError(
      "Add your Claude API key in Policy & key. This extension stays on your computer; it is not published.",
    );
    return;
  }

  setStatus("Waiting for the chat list…");
  const scraped = await chrome.tabs.sendMessage(tab.id, {
    type: "SCAN",
    lookbackMinutes: settings.lookbackMinutes || 30,
  });
  if (scraped?.error) {
    renderError(scraped.error);
    return;
  }

  setStatus("Briefing the urgent item…");
  const result = await chrome.runtime.sendMessage({
    type: "CLASSIFY",
    conversations: scraped.conversations || [],
  });
  if (result?.error) {
    renderError(result.error);
    return;
  }
  renderBriefing(result);
}

document.getElementById("scan").addEventListener("click", () => {
  void scan();
});
document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

if (!chrome?.runtime?.id) {
  renderBriefing(PREVIEW);
} else {
  void scan();
}
