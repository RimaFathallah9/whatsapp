---
name: whatsapp-inbox-agent
description: Manages WhatsApp Web conversations on this laptop. Use when the user asks to check WhatsApp, summarize recent chats, auto-reply to routine messages, or produce a "what should I answer" report. Reads skills/conversation-policy.md, then uses Claude Haiku via the Claude API.
---

# WhatsApp Inbox Agent

## What this skill does

Run the local WhatsApp Web agent in this repo. It attaches to the **existing WhatsApp Web session in Chrome on this laptop**. Claude Haiku (Claude API) applies `skills/conversation-policy.md`. It does not use a phone app.

## Always do this first

1. Read `skills/conversation-policy.md` (or `POLICY_PATH`) in full. That file is the decision layer: auto-reply rules, escalation, tone, priority.
2. Do not invent a different policy. If the user replaced that `.md`, use their file as-is.
3. If they attached a new `.md`, copy/overwrite `skills/conversation-policy.md` only if they asked, otherwise point `POLICY_PATH` at it.

## How to run

From the repo root:

```bash
npm run chrome
npm run agent
```

`npm run chrome` is only needed when Chrome was not started with remote debugging. If the agent says Chrome is already running without debugging, tell the user to close every Chrome window, then run `npm run chrome`, confirm WhatsApp Web is logged in, and rerun `npm run agent`.

Dry run (classify + report, never send):

```bash
npm run dry-run
```

After the command finishes, read `reports/latest.md` and show that report to the user in this exact structure:

1. WhatsApp Summary
2. Automatically Handled
3. Needs My Attention
4. Urgent / Important
5. Final Action List

## Safety

- Never send a message that the policy says needs the user.
- Never send when uncertain.
- Never invent facts or make commitments.
- Opening a chat in WhatsApp Web may mark it as read. Mention that if relevant.
- Classification and draft replies must go through Claude Haiku (`ANTHROPIC_API_KEY`, model `claude-haiku-4-5` unless `CLAUDE_MODEL` is set).

## Architecture (do not collapse these)

| Layer | Location | Change when |
| --- | --- | --- |
| Behavior / replies | `skills/*.md` | User updates rules |
| WhatsApp Web I/O | `src/whatsapp/` | UI selectors break |
| Claude Haiku | `src/llm/` | Claude API / model id |
| Classification | `src/analyze/` | Schema changes |
| Safety gate | `src/safety/` | Extra send checks |
| Report | `src/report/` | Output format |

If only the user's rules change, edit the `.md` file. Do not rewrite the agent.
