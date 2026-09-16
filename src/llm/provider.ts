import { envString } from "../config.js";

export type LlmProvider = {
  name: string;
  model: string;
  complete: (system: string, user: string) => Promise<string>;
};

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function claudeModel(): string {
  return envString("CLAUDE_MODEL") || envString("ANTHROPIC_MODEL") || "claude-haiku-4-5";
}

export function resolveLlm(): LlmProvider | null {
  const apiKey = envString("ANTHROPIC_API_KEY") || envString("CLAUDE_API_KEY");
  if (!apiKey) return null;

  const model = claudeModel();
  return {
    name: "claude",
    model,
    complete: async (system, user) => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          temperature: 0.1,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Claude API ${response.status}: ${text.slice(0, 400)}`);
      }
      return extractText(JSON.parse(text) as unknown);
    },
  };
}
