/* ═══════════════════ ANTHROPIC COSTING MODULE ═══════════════════ */
/*
 * Deterministic optimized-cost formulas for every finding category. The rule
 * engine (findIssues) and the LLM consensus path both price findings through
 * these functions, so a dollar figure never comes from an LLM — only from the
 * row's actual token volumes and the pricing table.
 */

import { AnthropicCategory, AnthropicModelTier } from "@/types/analysis";
import { pr } from "./pricing";

/** Row metrics every costing formula works from. */
export interface CostRow {
  model: string;
  inp: number; // input tokens / mo
  out: number; // output tokens / mo
  cached: number; // cache read tokens / mo
  cacheCreated: number; // cache write tokens / mo
  cur: number; // current monthly cost (USD)
  conf: number; // confidence 0-1, drives conservative reduction factors
}

/** Rule 1: reprice the row's tokens at Haiku rates. */
export function costHaikuDowngrade(row: CostRow): number {
  const h = pr("haiku-4-5");
  return (row.inp / 1e6) * h.i + (row.out / 1e6) * h.o;
}

/** Rule 4: reprice the row's tokens at Sonnet rates. */
export function costSonnetDowngrade(row: CostRow): number {
  const s = pr("sonnet-4-6");
  return (row.inp / 1e6) * s.i + (row.out / 1e6) * s.o;
}

/**
 * Rule 2: input reduction from tighter retrieval. High confidence justifies a
 * 50% cut, otherwise a conservative 40%. Opus rows are also repriced at Sonnet
 * (RAG quality is retrieval-bound, not model-bound).
 */
export function costRagReduction(row: CostRow, conf: number): number {
  const p = pr(row.model);
  const reductionFactor = conf >= 0.7 ? 0.5 : 0.6;
  const targetP = p.t === AnthropicModelTier.OPUS ? pr("sonnet-4-6") : p;
  return (
    ((row.inp * reductionFactor) / 1e6) * targetP.i +
    (row.out / 1e6) * targetP.o
  );
}

/** Rule 2's reduction factor, exposed so reason/action text can cite it. */
export function ragReductionFactor(conf: number): number {
  return conf >= 0.7 ? 0.5 : 0.6;
}

/** Rule 3: 60% of input assumed cacheable at 90% off after enabling caching. */
export function costEnableCaching(row: CostRow): number {
  const p = pr(row.model);
  const cacheable = row.inp * 0.6;
  return (
    ((row.inp - cacheable) / 1e6) * p.i +
    (cacheable / 1e6) * p.i * 0.1 +
    (row.out / 1e6) * p.o
  );
}

/**
 * Rule 5b: cache write break-even economics. Writes cost 25% more than plain
 * input; reads 90% less. Returns null when the row has no cache writes.
 */
export function cacheWriteEconomics(row: CostRow): {
  reuseFactor: number;
  writeExtra: number;
  readSaving: number;
  netCacheCost: number;
  opt: number;
} | null {
  if (row.cacheCreated <= 0) return null;
  const p = pr(row.model);
  const reuseFactor = row.cached / row.cacheCreated;
  const writeExtra = (row.cacheCreated / 1e6) * p.i * 0.25;
  const readSaving = (row.cached / 1e6) * p.i * 0.9;
  const netCacheCost = writeExtra - readSaving;
  return {
    reuseFactor,
    writeExtra,
    readSaving,
    netCacheCost,
    opt: row.cur - netCacheCost * 0.6,
  };
}

/** Rules 5/4b: Batch API's 50% discount on the whole workload. */
export function costBatchDiscount(row: CostRow): number {
  return row.cur * 0.5;
}

/**
 * Rule 6: reprice at the newest same-tier model; never above current cost
 * (an upgrade is recommended for quality even when it isn't cheaper).
 */
export function costGenerationUpgrade(row: CostRow): number {
  const p = pr(row.model);
  const newer =
    p.t === AnthropicModelTier.OPUS
      ? pr("opus-4-6")
      : p.t === AnthropicModelTier.SONNET
        ? pr("sonnet-4-6")
        : pr("haiku-4-5");
  const newerCost = (row.inp / 1e6) * newer.i + (row.out / 1e6) * newer.o;
  return Math.min(row.cur, newerCost);
}

/** The newest same-tier model's pricing entry, for reason/action text. */
export function upgradeTarget(model: string) {
  const p = pr(model);
  return p.t === AnthropicModelTier.OPUS
    ? pr("opus-4-6")
    : p.t === AnthropicModelTier.SONNET
      ? pr("sonnet-4-6")
      : pr("haiku-4-5");
}

/**
 * Category dispatcher for the consensus path: given an LLM-proposed category
 * and the row's real metrics, return the deterministic optimized monthly cost,
 * or null when that category can't be costed for that row.
 */
export function optimizedCostAnthropic(
  cat: AnthropicCategory,
  row: CostRow
): number | null {
  switch (cat) {
    case AnthropicCategory.MODEL_DOWNGRADE_HAIKU:
      return row.inp + row.out > 0 ? costHaikuDowngrade(row) : null;
    case AnthropicCategory.MODEL_DOWNGRADE_SONNET:
      return row.inp + row.out > 0 ? costSonnetDowngrade(row) : null;
    case AnthropicCategory.RAG_OPTIMIZATION:
      return row.inp > 0 ? costRagReduction(row, row.conf) : null;
    case AnthropicCategory.PROMPT_CACHING:
      return row.inp > 0 ? costEnableCaching(row) : null;
    case AnthropicCategory.BATCH_API_MIGRATION:
      return row.cur > 0 ? costBatchDiscount(row) : null;
    case AnthropicCategory.MODEL_UPGRADE:
      return row.inp + row.out > 0 ? costGenerationUpgrade(row) : null;
    default:
      // No deterministic formula (e.g. Prompt Optimization, Workspace
      // Organization) — the caller decides whether a zero-savings finding
      // survives.
      return null;
  }
}
