/* ═══════════════════ OpenAI PRICING TABLE ═══════════════════ */

import type { PricingInfo } from "@/types";
import { OpenAIModelTier } from "@/types";

/** ISO date when pricing was last verified against OpenAI's pricing page. */
export const PRICING_TABLE_DATE = "2026-06-14";

/**
 * OpenAI Model pricing map
 * Prices per million tokens ($/MTok)
 */
export const MP_OPENAI: Record<string, PricingInfo> = {
  // GPT-4o series
  "gpt-4o": { i: 2.5, o: 10, l: "GPT-4o", t: OpenAIModelTier.GPT4O, g: 4 },
  "gpt-4o-mini": {
    i: 0.15,
    o: 0.6,
    l: "GPT-4o Mini",
    t: OpenAIModelTier.GPT4O_MINI,
    g: 4,
  },

  // GPT-4 Turbo (deprecated)
  "gpt-4-turbo": {
    i: 5,
    o: 15,
    l: "GPT-4 Turbo",
    t: OpenAIModelTier.GPT4_TURBO,
    g: 3,
  },
  "gpt-4-turbo-preview": {
    i: 5,
    o: 15,
    l: "GPT-4 Turbo Preview",
    t: OpenAIModelTier.GPT4_TURBO,
    g: 3,
  },

  // o1 reasoning models
  o1: { i: 15, o: 60, l: "o1", t: OpenAIModelTier.O1, g: 4 },
  "o1-mini": { i: 3, o: 12, l: "o1 Mini", t: OpenAIModelTier.O1, g: 4 },
  "o1-preview": { i: 15, o: 60, l: "o1 Preview", t: OpenAIModelTier.O1, g: 4 },

  // o3 series (newer)
  o3: { i: 2, o: 8, l: "o3", t: OpenAIModelTier.O3, g: 5 },
  "o3-mini": { i: 1.1, o: 4.4, l: "o3 Mini", t: OpenAIModelTier.O3, g: 5 },

  // Legacy GPT-4
  "gpt-4": { i: 30, o: 60, l: "GPT-4", t: OpenAIModelTier.GPT4, g: 2 },
  "gpt-4-32k": { i: 60, o: 120, l: "GPT-4 32k", t: OpenAIModelTier.GPT4, g: 2 },

  // GPT-3.5
  "gpt-3.5-turbo": {
    i: 0.5,
    o: 1.5,
    l: "GPT-3.5 Turbo",
    t: OpenAIModelTier.GPT3_5,
    g: 1,
  },
};

/**
 * Model keys longest-first. Lookup is a substring test, and several keys are
 * prefixes of others ("gpt-4o" of "gpt-4o-mini", "o1" of "o1-mini", "gpt-4" of
 * "gpt-4-32k"). Insertion order matched the prefix first, so every "-mini"
 * variant priced as its full-size parent — gpt-4o-mini at $2.50/$10 instead of
 * $0.15/$0.60. Longest match wins, so the most specific key always answers.
 */
const MP_OPENAI_KEYS = Object.keys(MP_OPENAI).sort(
  (a, b) => b.length - a.length
);

/**
 * Get pricing information for a given OpenAI model string
 * @param m - Model name/identifier (e.g., "gpt-4o", "gpt-4o-mini")
 * @returns PricingInfo object with input/output costs and metadata
 */
export function prOpenAI(m: string | undefined): PricingInfo {
  if (!m)
    return { i: 2.5, o: 10, l: m || "unknown", t: OpenAIModelTier.GPT4O, g: 0 };
  const k = m.toLowerCase();

  // Most specific key first
  for (const key of MP_OPENAI_KEYS) {
    if (k.includes(key)) return MP_OPENAI[key];
  }

  // "gpt-3.5" is the one alias that is not itself a key (the key is
  // "gpt-3.5-turbo"), so a bare "gpt-3.5-*" id still needs catching.
  if (k.includes("gpt-3.5")) return MP_OPENAI["gpt-3.5-turbo"];

  // Default to GPT-4o
  return { i: 2.5, o: 10, l: m, t: OpenAIModelTier.GPT4O, g: 0 };
}

/**
 * Calculate total cost for a given OpenAI model and token usage
 * @param m - Model name/identifier
 * @param inp - Input token count
 * @param out - Output token count
 * @returns Total cost in dollars
 */
export function tcOpenAI(
  m: string | undefined,
  inp: number,
  out: number
): number {
  const p = prOpenAI(m);
  return (inp / 1e6) * p.i + (out / 1e6) * p.o;
}
