import fs from "node:fs";
import path from "node:path";
import { reportsDir } from "../config.js";
import type { RunReport } from "../types.js";

function stamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function formatReport(report: RunReport): string {
  const decisions = report.conversations;
  const auto = decisions.filter((d) => d.disposition === "auto_reply");
  const needs = decisions.filter((d) => d.disposition === "needs_you");
  const urgent = decisions.filter((d) => d.priority === "urgent" || d.priority === "important");
  const sentByChat = new Map(report.sent.filter((s) => s.sent).map((s) => [s.chatId, s]));

  const summaryLines = decisions.length
    ? decisions.map((d) => {
        const status =
          sentByChat.has(d.chatId)
            ? "Automatically handled"
            : d.disposition === "no_action"
              ? "No action required"
              : "Needs an answer";
        return `* ${d.contact} → ${d.topic} (${status})`;
      })
    : ["* No conversations in this window"];

  const autoLines = report.sent.filter((s) => s.sent).length
    ? report.sent
        .filter((s) => s.sent)
        .map((s) => `* ${s.contact} → sent: "${s.text}"`)
    : auto.length
      ? auto.map((d) => `* ${d.contact} → classified for auto-reply but not sent${report.dryRun ? " (dry run)" : ""}: "${d.autoReplyText || ""}"`)
      : ["* None"];

  const needsBlocks = needs.length
    ? needs
        .map(
          (d) => `**Contact:** ${d.contact}

**What they said:**
${d.whatTheySaid}

**What they need from me:**
${d.theyNeed}

**What I should answer:**
${d.suggestedReply}

**Priority:**
${d.priority[0].toUpperCase()}${d.priority.slice(1)}`,
        )
        .join("\n\n")
    : "* None";

  const urgentLines = urgent.length
    ? urgent.map((d) => `* ${d.priority.toUpperCase()} — ${d.contact}: ${d.theyNeed}`)
    : ["* None"];

  const checklist = [
    ...report.sent.map((s) =>
      s.sent
        ? `* [x] ${s.contact} → Automatically handled`
        : `* [ ] ${s.contact} → ${s.skippedReason || "Not sent"}`,
    ),
    ...needs.map((d) => `* [ ] Reply to ${d.contact} → ${d.suggestedReply}`),
    ...decisions
      .filter((d) => d.disposition === "no_action")
      .map((d) => `* [x] ${d.contact} → No action required`),
  ];

  const errorBlock = report.errors.length
    ? `\n\n### Errors\n${report.errors.map((e) => `* ${e}`).join("\n")}`
    : "";

  return `### 📊 1. WhatsApp Summary

**WhatsApp — Last ${report.lookbackMinutes} Minutes**
Generated ${stamp(report.generatedAt)} · Policy: ${report.policyFile}${report.dryRun ? " · DRY RUN" : ""}

${summaryLines.join("\n")}

### 🤖 2. Automatically Handled

${autoLines.join("\n")}

### ⚠️ 3. Needs My Attention

${needsBlocks}

### 🔴 4. Urgent / Important

${urgentLines.join("\n")}

### ✅ 5. Final Action List

${checklist.length ? checklist.join("\n") : "* [x] Nothing to do"}
${errorBlock}
`;
}

export function writeReport(report: RunReport): { latest: string; stamped: string } {
  const markdown = formatReport(report);
  const dir = reportsDir();
  const latest = path.join(dir, "latest.md");
  const day = new Date(report.generatedAt).toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const stamped = path.join(dir, `${day}.md`);
  fs.writeFileSync(latest, markdown, "utf8");
  fs.writeFileSync(stamped, markdown, "utf8");
  fs.appendFileSync(
    path.join(dir, "sent-log.jsonl"),
    report.sent.map((s) => JSON.stringify({ at: report.generatedAt, ...s })).join("\n") +
      (report.sent.length ? "\n" : ""),
    "utf8",
  );
  return { latest, stamped };
}
