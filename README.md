# WhatsApp inbox agent

Manages WhatsApp through the **WhatsApp Web window already logged in on this laptop**. It does not need the WhatsApp mobile app.

**Claude Haiku** (Claude API) reads `skills/conversation-policy.md` and decides what is safe to answer. Replace that `.md` anytime — the rest of the agent stays the same.

## What it does

1. Attaches to your existing Chrome WhatsApp Web session.
2. Reads conversations from about the last 30 minutes.
3. Sends each thread to Claude Haiku with the policy file.
4. Sends a reply only when the policy and the safety gate both say it is routine.
5. Writes a five-part report to `reports/latest.md`.

## One-time setup

```bash
npm install
copy .env.example .env
```

Put your Claude API key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5
```

Without a key, the agent still reports, but it will not auto-send.

## Every run

Chrome must be started with remote debugging so the agent can use the same window where you are already logged in.

```bash
npm run chrome
```

Confirm [web.whatsapp.com](https://web.whatsapp.com) shows your chat list (not a QR code). Leave that window open.

```bash
npm run agent
```

Dry run (no sends):

```bash
npm run dry-run
```

If Chrome was already open without debugging, close every Chrome window first, then `npm run chrome`.

## Update how it answers

Edit `skills/conversation-policy.md`, or set `POLICY_PATH` to another `.md`. You do not need to change TypeScript for new rules.

## Layout

| Path | Role |
| --- | --- |
| `skills/conversation-policy.md` | Rules, tone, auto-reply vs escalate |
| `src/whatsapp/` | WhatsApp Web read/send on this laptop |
| `src/llm/` | Claude Haiku via the Claude API |
| `src/analyze/` | Classification |
| `src/safety/` | Pre-send checks |
| `src/report/` | Five-part report |
| `reports/latest.md` | Last run |

Opening a chat can mark it read in WhatsApp Web. That is a WhatsApp limitation, not something this agent can avoid while reading full context.
