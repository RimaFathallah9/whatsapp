const PRIORITY_RANK = { urgent: 0, important: 1, normal: 2, low: 3 };

function parseFrontmatter(markdown) {
  const match = String(markdown || "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { lookbackMinutes: 30, markdown: String(markdown || "") };
  const lookback = match[1].match(/lookback_minutes:\s*(\d+)/i);
  return {
    lookbackMinutes: lookback ? Number(lookback[1]) : 30,
    markdown: String(markdown || ""),
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["apiKey", "model", "policyMarkdown"]);
  let policyMarkdown = stored.policyMarkdown;
  if (!policyMarkdown) {
    const res = await fetch(chrome.runtime.getURL("policy.md"));
    policyMarkdown = await res.text();
  }
  const parsed = parseFrontmatter(policyMarkdown);
  return {
    apiKey: stored.apiKey || "",
    model: stored.model || "claude-haiku-4-5",
    policyMarkdown: parsed.markdown,
    lookbackMinutes: parsed.lookbackMinutes,
  };
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  return JSON.parse(raw);
}

function extractText(payload) {
  if (!payload || typeof payload !== "object") return "";
  const content = payload.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

function formatConversation(convo) {
  const lines = (convo.messages || []).map((m) => {
    const when = new Date(m.timestamp || Date.now()).toISOString();
    return `[${when}] ${m.fromMe ? "ME" : m.sender || convo.contact}: ${m.text}`;
  });
  return [
    `Contact: ${convo.contact}`,
    `Group: ${convo.isGroup ? "yes" : "no"}`,
    `Unread: ${convo.unread ? "yes" : "no"}`,
    `Preview: ${convo.lastPreview || ""}`,
    "Messages:",
    ...lines,
  ].join("\n");
}

function heuristic(convo) {
  const latest = convo.messages?.[convo.messages.length - 1];
  const lastInbound = [...(convo.messages || [])].reverse().find((m) => !m.fromMe);
  const blob = (convo.messages || []).map((m) => m.text).join("\n");
  const latestFromMe = Boolean(latest?.fromMe);
  const escalate = /money|pay|invoice|salary|contract|legal|urgent|asap|call me|meeting|deadline|visa|nanny|candidate|offer/i.test(
    blob,
  );
  let disposition = "needs_you";
  if (latestFromMe || !lastInbound) disposition = "no_action";
  const priority = /emergency|urgent|asap|call me/i.test(blob)
    ? "urgent"
    : escalate
      ? "important"
      : "normal";
  return {
    contact: convo.contact,
    chatId: convo.chatId || convo.contact,
    isGroup: Boolean(convo.isGroup),
    topic: (lastInbound?.text || convo.lastPreview || "").slice(0, 120),
    whatTheySaid: lastInbound?.text || convo.lastPreview || "",
    theyNeed: disposition === "no_action" ? "Nothing right now" : "A reply from you",
    priority,
    disposition,
    suggestedReply: disposition === "no_action" ? "" : "",
    reason: "Heuristic fallback",
    confidence: 0.4,
    uncertainty: disposition !== "no_action",
    requiresApproval: disposition !== "no_action",
  };
}

function pickMostUrgent(decisions) {
  const actionable = decisions.filter((d) => d.disposition === "needs_you");
  actionable.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 9;
    const pb = PRIORITY_RANK[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return 0;
  });
  const top = actionable[0] || null;
  const also = actionable.slice(1).filter((d) => d.priority === "urgent" || d.priority === "important");
  return { top, also };
}

async function classifyWithClaude(conversations, settings) {
  const system = `You are Claude Haiku acting as my private WhatsApp briefing officer. Classify each conversation using ONLY the policy markdown and the conversation text.

You always write as me: a senior recruiter, lawyer, or commercial operator — pick the hat the thread requires. Calm, precise, first person. Never intern tone. Never as an AI.

Return JSON: {"decisions":[{...}]}.

Each decision:
- contact, chatId, topic, whatTheySaid, theyNeed
- theyNeed: one short line — what they actually require from me
- priority: urgent | important | normal | low
- disposition: auto_reply | needs_you | no_action
- suggestedReply: the exact message I should send (even if disposition is needs_you)
- reason, confidence 0-1, uncertainty boolean, requiresApproval boolean

Hard rules:
- This briefing popup never auto-sends. Put anything that needs me as needs_you.
- If uncertain, disposition must be needs_you.
- suggestedReply must be in the contact's language, first person as me, ready to copy.
- Never invent facts, fees, dates, legal positions, or hiring decisions.`;

  const user = `POLICY FILE:
${settings.policyMarkdown}

CONVERSATIONS:
${conversations.map((c, i) => `--- Conversation ${i + 1} ---\n${formatConversation(c)}`).join("\n\n")}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 4000,
      temperature: 0.1,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Claude API ${response.status}: ${text.slice(0, 280)}`);
  }
  const parsed = extractJson(extractText(JSON.parse(text)));
  const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
  return decisions.map((d, i) => {
    const convo = conversations[i] || conversations.find((c) => c.contact === d.contact) || conversations[0];
    return {
      contact: d.contact || convo.contact,
      chatId: d.chatId || convo.chatId || convo.contact,
      isGroup: Boolean(convo.isGroup),
      topic: d.topic || "",
      whatTheySaid: d.whatTheySaid || convo.lastPreview || "",
      theyNeed: d.theyNeed || "A reply from you",
      priority: d.priority || "important",
      disposition: d.disposition || "needs_you",
      suggestedReply: d.suggestedReply || "",
      reason: d.reason || "",
      confidence: typeof d.confidence === "number" ? d.confidence : 0.7,
      uncertainty: Boolean(d.uncertainty),
      requiresApproval: d.requiresApproval !== false,
    };
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SETTINGS") {
    loadSettings()
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message?.type !== "CLASSIFY") return;

  (async () => {
    const settings = await loadSettings();
    const conversations = message.conversations || [];
    if (!conversations.length) {
      return { top: null, also: [], lookbackMinutes: settings.lookbackMinutes };
    }
    if (!settings.apiKey) {
      throw new Error("Add your Claude API key in the extension options first.");
    }
    let decisions;
    try {
      decisions = await classifyWithClaude(conversations, settings);
    } catch (error) {
      decisions = conversations.map(heuristic);
      const picked = pickMostUrgent(decisions);
      return {
        ...picked,
        warning: error instanceof Error ? error.message : String(error),
        lookbackMinutes: settings.lookbackMinutes,
      };
    }
    return { ...pickMostUrgent(decisions), lookbackMinutes: settings.lookbackMinutes };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
