import type { AIProvider, ProviderResult } from "./types";
import { SYSTEM_PROMPT, uniqueCitations } from "./types";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[]; webSearchQueries?: string[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Prepared, untested without a key: Gemini with Google Search grounding. */
export const geminiProvider: AIProvider = {
  id: "gemini",
  name: "Gemini",
  browses: true,
  get model() {
    return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  },
  isConfigured: () => !!process.env.GEMINI_API_KEY,
  async executePrompt(prompt): Promise<ProviderResult> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as GeminiResponse;
    const cand = data.candidates?.[0];
    return {
      text: cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      citations: uniqueCitations((cand?.groundingMetadata?.groundingChunks ?? []).map((c) => ({ url: c.web?.uri ?? "", title: c.web?.title }))),
      model: this.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        webSearchCalls: cand?.groundingMetadata?.webSearchQueries?.length ? 1 : 0,
      },
    };
  },
};
