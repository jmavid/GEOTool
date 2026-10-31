
export interface Citation {
  url: string;
  title?: string;
}

export interface ProviderResult {
  text: string;
  citations: Citation[];
  model: string;
  usage: { inputTokens: number; outputTokens: number; webSearchCalls: number };
}

export interface ExecuteOptions {
  /** ISO 3166-1 alpha-2, used to localize web search when the provider supports it. */
  country?: string;
  /** Language the question is written in, e.g. "es". */
  language?: string;
}

/** Every AI engine we test against implements this. Keep it tiny. */
export interface AIProvider {
  /** Stable id stored with each response ("gpt-oss-120b", "openai"...). */
  id: string;
  /** Human name shown in the UI. */
  name: string;
  model: string;
  /** True if it searches the web, so its answers can cite the brand's site. */
  browses: boolean;
  isConfigured(): boolean;
  executePrompt(prompt: string, options?: ExecuteOptions): Promise<ProviderResult>;
}

export const SYSTEM_PROMPT =
  "You are a helpful assistant answering a user's question. Answer naturally as you normally would, recommending specific products, companies or services by name when relevant.";

export function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}
