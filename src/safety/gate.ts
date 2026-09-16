import type { Policy } from "../policy/load.js";
import type { Conversation, ConversationDecision } from "../types.js";

const BLOCK = [
  /\b(password|otp|verification code|pin code|account number|iban|swift)\b/i,
  /\b(i (can|will|promise|guarantee|agree to|confirm that I can))\b/i,
  /\b(pay|paid|invoice|salary|contract|lawyer|hospital|emergency)\b/i,
  /\b(as an ai|language model|i'm an assistant)\b/i,
];

export function canAutoSend(
  decision: ConversationDecision,
  conversation: Conversation,
  policy: Policy,
): { ok: true } | { ok: false; reason: string } {
  if (!policy.settings.autoSend) {
    return { ok: false, reason: "Policy auto_send is disabled" };
  }
  if (decision.disposition !== "auto_reply") {
    return { ok: false, reason: `Disposition is ${decision.disposition}` };
  }
  if (decision.uncertainty || decision.requiresApproval) {
    return { ok: false, reason: "Marked uncertain or requiring approval" };
  }
  if (decision.confidence < policy.settings.confidenceMin) {
    return { ok: false, reason: `Confidence ${decision.confidence} below ${policy.settings.confidenceMin}` };
  }
  const text = (decision.autoReplyText || "").trim();
  if (!text) {
    return { ok: false, reason: "No auto-reply text" };
  }
  if (text.length > 280) {
    return { ok: false, reason: "Auto-reply is too long to be a routine acknowledgement" };
  }
  if (conversation.isGroup && !/direct|asked me|mentioned/i.test(decision.reason)) {
    return { ok: false, reason: "Group chat without a clear direct ask" };
  }
  const last = conversation.messages[conversation.messages.length - 1];
  if (last?.fromMe) {
    return { ok: false, reason: "Latest message is already from me" };
  }
  for (const rule of BLOCK) {
    if (rule.test(text) || rule.test(decision.whatTheySaid)) {
      return { ok: false, reason: `Blocked by safety pattern ${rule}` };
    }
  }
  const inbound = conversation.messages.filter((m) => !m.fromMe).map((m) => m.text.toLowerCase());
  if (inbound.length === 0) {
    return { ok: false, reason: "No inbound message to answer" };
  }
  return { ok: true };
}
