/* ═══════════════════ PRICING TABLE ═══════════════════ */

import type { PricingInfo } from "@/types";
import { AnthropicModelTier } from "@/types";

/** ISO date when pricing was last verified against Anthropic's pricing page. */
export const PRICING_TABLE_DATE = "2026-06-14";

/**
 * Model pricing map (MP)
 * Maps model identifiers to their pricing information
 */
export const MP: Record<string, PricingInfo> = {
  // Claude 4 family (gen 4)
  "opus-4-8": { i: 5, o: 25, l: "Opus 4.8", t: AnthropicModelTier.OPUS, g: 4 },
  "opus-4-6": { i: 5, o: 25, l: "Opus 4.6", t: AnthropicModelTier.OPUS, g: 4 },
  "opus-4-5": { i: 15, o: 75, l: "Opus 4.5", t: AnthropicModelTier.OPUS, g: 3 },
  "opus-4-1": { i: 15, o: 75, l: "Opus 4.1", t: AnthropicModelTier.OPUS, g: 3 },
  "sonnet-4-6": {
    i: 3,
    o: 15,
    l: "Sonnet 4.6",
    t: AnthropicModelTier.SONNET,
    g: 4,
  },
  "sonnet-4-5": {
    i: 3,
    o: 15,
    l: "Sonnet 4.5",
    t: AnthropicModelTier.SONNET,
    g: 3,
  },
  "sonnet-4": {
    i: 3,
    o: 15,
    l: "Sonnet 4",
    t: AnthropicModelTier.SONNET,
    g: 3,
  },
  "sonnet-3-7": {
    i: 3,
    o: 15,
    l: "Sonnet 3.7",
    t: AnthropicModelTier.SONNET,
    g: 2,
  },
  "sonnet-3-5": {
    i: 3,
    o: 15,
    l: "Sonnet 3.5",
    t: AnthropicModelTier.SONNET,
    g: 2,
  },
  "haiku-4-5": {
    i: 0.8,
    o: 4,
    l: "Haiku 4.5",
    t: AnthropicModelTier.HAIKU,
    g: 3,
  },
  "haiku-3-5": {
    i: 0.25,
    o: 1.25,
    l: "Haiku 3.5",
    t: AnthropicModelTier.HAIKU,
    g: 2,
  },
  "3-opus": { i: 15, o: 75, l: "Opus 3", t: AnthropicModelTier.OPUS, g: 1 },
  "3-sonnet": {
    i: 3,
    o: 15,
    l: "Sonnet 3",
    t: AnthropicModelTier.SONNET,
    g: 1,
  },
  "3-haiku": {
    i: 0.25,
    o: 1.25,
    l: "Haiku 3",
    t: AnthropicModelTier.HAIKU,
    g: 1,
  },
};

/**
 * Get pricing information for a given model string
 * @param m - Model name/identifier (e.g., "claude-opus-4-6", "sonnet-3-5")
 * @returns PricingInfo object with input/output costs and metadata
 */
export function pr(m: string | undefined): PricingInfo {
  if (!m)
    return {
      i: 3,
      o: 15,
      l: m || "unknown",
      t: AnthropicModelTier.SONNET,
      g: 0,
    };
  const k = m.toLowerCase();
  for (const [key, v] of Object.entries(MP)) if (k.includes(key)) return v;
  if (k.includes("opus"))
    return { i: 15, o: 75, l: m, t: AnthropicModelTier.OPUS, g: 0 };
  if (k.includes("haiku"))
    return { i: 0.8, o: 4, l: m, t: AnthropicModelTier.HAIKU, g: 0 };
  return { i: 3, o: 15, l: m, t: AnthropicModelTier.SONNET, g: 0 };
}

/**
 * Calculate total cost for a given model and token usage
 * @param m - Model name/identifier
 * @param inp - Input token count
 * @param out - Output token count
 * @returns Total cost in dollars
 */
export function tc(m: string | undefined, inp: number, out: number): number {
  const p = pr(m);
  return (inp / 1e6) * p.i + (out / 1e6) * p.o;
}
