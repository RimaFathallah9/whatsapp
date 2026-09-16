import { envBool } from "./config.js";
import { loadPolicy, policyName } from "./policy/load.js";
import { connectWhatsApp } from "./whatsapp/session.js";
import { readRecentConversations } from "./whatsapp/reader.js";
import { sendWhatsAppMessage } from "./whatsapp/sender.js";
import { classifyConversations } from "./analyze/classify.js";
import { canAutoSend } from "./safety/gate.js";
import { formatReport, writeReport } from "./report/format.js";
import type { RunReport, SendResult } from "./types.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export async function runAgent(): Promise<RunReport> {
  const dryRun = envBool("DRY_RUN") || hasFlag("--dry-run");
  const policy = loadPolicy();
  const errors: string[] = [];
  const sent: SendResult[] = [];

  const session = await connectWhatsApp();
  try {
    const conversations = await readRecentConversations(
      session.page,
      policy.settings.lookbackMinutes,
    );
    const decisions = await classifyConversations(conversations, policy);

    for (const decision of decisions) {
      if (decision.disposition !== "auto_reply") continue;
      const convo = conversations.find((c) => c.chatId === decision.chatId || c.contact === decision.contact);
      if (!convo) {
        sent.push({
          contact: decision.contact,
          chatId: decision.chatId,
          text: decision.autoReplyText || "",
          sent: false,
          skippedReason: "Conversation context missing",
        });
        continue;
      }

      const gate = canAutoSend(decision, convo, policy);
      if (!gate.ok) {
        decision.disposition = "needs_you";
        decision.requiresApproval = true;
        decision.reason = `${decision.reason} (not sent: ${gate.reason})`;
        continue;
      }

      if (dryRun || !envBool("AUTO_SEND", true)) {
        sent.push({
          contact: decision.contact,
          chatId: decision.chatId,
          text: decision.autoReplyText || "",
          sent: false,
          skippedReason: dryRun ? "dry run" : "AUTO_SEND=false",
        });
        continue;
      }

      try {
        await sendWhatsAppMessage(session.page, decision.contact, decision.autoReplyText!);
        sent.push({
          contact: decision.contact,
          chatId: decision.chatId,
          text: decision.autoReplyText!,
          sent: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${decision.contact}: ${message}`);
        decision.disposition = "needs_you";
        sent.push({
          contact: decision.contact,
          chatId: decision.chatId,
          text: decision.autoReplyText!,
          sent: false,
          skippedReason: message,
        });
      }
    }

    const report: RunReport = {
      generatedAt: new Date().toISOString(),
      lookbackMinutes: policy.settings.lookbackMinutes,
      policyFile: policyName(policy),
      dryRun,
      conversations: decisions,
      sent,
      errors,
    };
    writeReport(report);
    return report;
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  try {
    const report = await runAgent();
    process.stdout.write(`${formatReport(report)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
