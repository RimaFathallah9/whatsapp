import { z } from "zod";
import type { Policy } from "../policy/load.js";
import type { Conversation, ConversationDecision, Disposition, Priority } from "../types.js";
import { resolveLlm } from "../llm/provider.js";

const DecisionSchema = z.object({
  contact: z.string(),
  chatId: z.string().optional(),
  topic: z.string(),
  whatTheySaid: z.string(),
  theyNeed: z.string(),
  priority: z.enum(["urgent", "important", "normal", "low"]),
  disposition: z.enum(["auto_reply", "needs_you", "no_action"]),
  suggestedReply: z.string(),
  autoReplyText: z.string().optional(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  uncertainty: z.boolean(),
  requiresApproval: z.boolean(),
});

const BatchSchema = z.object({
  decisions: z.array(DecisionSchema),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  return JSON.parse(raw);
}

const AUTO_OK =
  /\b(thanks?|thank you|merci|shukran|ok+|okay|noted|received|got it|👍|🙏)\b/i;
const ESCALATE =
  /\b(money|pay|paid|invoice|salary|contract|legal|lawyer|doctor|hospital|emergency|password|otp|code|visa|urgent|asap|call me|meeting|deadline|loan|bank)\b/i;

function heuristicDecision(convo: Conversation, _policy: Policy): ConversationDecision {
  const latest = convo.messages[convo.messages.length - 1];
  const latestFromMe = Boolean(latest?.fromMe);
  const blob = convo.messages.map((m) => m.text).join("\n");
  const lastInbound = [...convo.messages].reverse().find((m) => !m.fromMe);
  const escalate = convo.isGroup || ESCALATE.test(blob) || !lastInbound;
  const simpleAck = Boolean(lastInbound && AUTO_OK.test(lastInbound.text) && lastInbound.text.length < 80);

  let disposition: Disposition = "needs_you";
  if (latestFromMe || !lastInbound) disposition = "no_action";

  const priority: Priority = /emergency|urgent|asap|call me/i.test(blob)
    ? "urgent"
    : escalate
      ? "important"
      : simpleAck
        ? "low"
        : "normal";

  const suggested =
    disposition === "no_action"
      ? ""
      : `Reply to ${convo.contact} about: ${lastInbound?.text || convo.lastPreview}`;

  return {
    contact: convo.contact,
    chatId: convo.chatId,
    isGroup: convo.isGroup,
    latestAt: new Date(convo.lastTimestamp).toISOString(),
    topic: (lastInbound?.text || convo.lastPreview || "Recent messages").slice(0, 120),
    whatTheySaid: lastInbound?.text || convo.lastPreview || "No inbound text",
    theyNeed: disposition === "no_action" ? "Nothing" : "A reply from you",
    priority,
    disposition,
    suggestedReply: suggested,
    reason: "No Claude API key configured — nothing was auto-sent. Set ANTHROPIC_API_KEY so Haiku can apply the policy file.",
    confidence: 0.4,
    uncertainty: disposition !== "no_action",
    requiresApproval: disposition !== "no_action",
  };
}

function formatConversation(convo: Conversation): string {
  const lines = convo.messages.map((m) => {
    const when = new Date(m.timestamp).toISOString();
    return `[${when}] ${m.fromMe ? "ME" : m.sender}: ${m.text}`;
  });
  return [
    `Contact: ${convo.contact}`,
    `Group: ${convo.isGroup ? "yes" : "no"}`,
    `Unread: ${convo.unread ? "yes" : "no"}`,
    `Preview: ${convo.lastPreview}`,
    "Messages:",
    ...lines,
  ].join("\n");
}

export async function classifyConversations(
  conversations: Conversation[],
  policy: Policy,
): Promise<ConversationDecision[]> {
  if (conversations.length === 0) return [];

  const llm = resolveLlm();
  if (!llm) {
    return conversations.map((c) => heuristicDecision(c, policy));
  }

  const system = `You are Claude Haiku acting as my private WhatsApp briefing officer. Classify each conversation using ONLY the policy markdown and the conversation text.

You always write as me: a senior recruiter, lawyer, or commercial operator — pick the hat the thread requires. Calm, precise, first person. Never intern tone. Never as an AI.

Return JSON: {"decisions":[{...}]}.

Each decision:
- contact, chatId, topic, whatTheySaid, theyNeed
- theyNeed: one short line — what they actually require from me
- priority: urgent | important | normal | low
- disposition: auto_reply | needs_you | no_action
- suggestedReply: the exact message I should send (even if disposition is needs_you)
- autoReplyText: only if disposition is auto_reply; the exact message to send
- reason, confidence 0-1, uncertainty boolean, requiresApproval boolean

Hard rules:
- auto_reply only when the policy says it is safe AND you are not uncertain AND you are not inventing facts AND you are not making a decision for me.
- If uncertain, disposition must be needs_you, uncertainty true, requiresApproval true, autoReplyText omitted.
- suggestedReply must be in the contact's language.
- Speak as me (first person), never as an AI.
- Prefer escalating anything commercial, legal, hiring, or time-critical.`;

  const user = `POLICY FILE (${policy.filePath}):
${policy.markdown}

CONVERSATIONS:
${conversations.map((c, i) => `--- Conversation ${i + 1} ---\n${formatConversation(c)}`).join("\n\n")}`;

  try {
    const raw = await llm.complete(system, user);
    const parsed = BatchSchema.parse(extractJson(raw));
    return parsed.decisions.map((d, i) => {
      const convo = conversations[i] ?? conversations.find((c) => c.contact === d.contact) ?? conversations[0];
      return {
        ...d,
        contact: d.contact || convo.contact,
        chatId: d.chatId || convo.chatId,
        isGroup: convo.isGroup,
        latestAt: new Date(convo.lastTimestamp).toISOString(),
        autoReplyText: d.disposition === "auto_reply" ? d.autoReplyText || d.suggestedReply : undefined,
      };
    });
  } catch {
    return conversations.map((c) => heuristicDecision(c, policy));
  }
}
