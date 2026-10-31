import { z } from "zod";

/**
 * Extracts a JSON value from an LLM reply that may be wrapped in code fences,
 * prefixed with prose or truncated after the closing brace. Returns undefined if none.
 */
export function parseJsonLoose(text: string | null | undefined): unknown {
  if (!text) return undefined;
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const first = trimmed.search(/[[{]/);
  if (first >= 0) {
    const open = trimmed[first];
    const close = open === "{" ? "}" : "]";
    const last = trimmed.lastIndexOf(close);
    if (last > first) candidates.push(trimmed.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

/** Parses + validates; returns null instead of throwing so callers can retry or fall back. */
export function parseWithSchema<T extends z.ZodType>(text: string | null | undefined, schema: T): z.infer<T> | null {
  const value = parseJsonLoose(text);
  if (value === undefined) return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

/** LLMs overshoot length limits; clip instead of rejecting the whole answer. */
export const clipped = (max: number) => z.string().trim().transform((s) => s.slice(0, max));
export const upTo = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));
