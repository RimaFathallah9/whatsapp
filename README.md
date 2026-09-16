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

If PowerShell blocks `npm` (`npm.ps1 cannot be loaded because running scripts is disabled`), use the `.cmd` files or `npm.cmd` instead:

```bat
.\install.cmd
copy .env.example .env
```

Or in the same PowerShell window:

```powershell
npm.cmd install
```

To allow `npm` itself in PowerShell from now on (current user only):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Put your Claude API key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5
```

Without a key, the agent still reports, but it will not auto-send.

## Private Chrome extension

Unpacked, this computer only — not on the Chrome Web Store.

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** and select the `extension` folder in this project
4. Open the extension **Policy & key** page, paste `ANTHROPIC_API_KEY`, and paste or keep the `.md` policy
5. Open [WhatsApp Web](https://web.whatsapp.com) in **your chrome**
6. Click the extension icon

The popup shows **only the most urgent item**: what they need, and the reply you should send, in your voice as a senior recruiter, lawyer, or commercial operator. Routine threads stay out of the popup. The extension does not send messages.

Or run:

```bat
.\load-extension.cmd
```

## Desktop agent

The original Playwright agent is still here if you want a full report instead of the popup:

`chrome.cmd`, `agent.cmd`, and `dry-run.cmd` all open the **your chrome** profile (not Guest, not the picker).

```bat
.\agent.cmd
```

Dry run (no sends):

```bat
.\dry-run.cmd
```

Or only start Chrome first:

```bat
.\chrome.cmd
```

Confirm [web.whatsapp.com](https://web.whatsapp.com) shows your chat list (not a QR code).

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
