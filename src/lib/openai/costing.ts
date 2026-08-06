/* ═══════════════════ OpenAI COSTING MODULE ═══════════════════ */
/*
 * Deterministic optimized-cost formulas for every OpenAI finding category.
 * The rule engine (findIssuesOpenAI) and the LLM consensus path both price
 * findings through these functions — dollar figures always come from the
 * row's actual metrics and the pricing table, never from an LLM.
 */

import { OpenAICategory } from "@/types/analysis";
import { prOpenAI } from "./pricing";

/** Row metrics every OpenAI costing formula works from. */
export interface OpenAICostRow {
  model: string;
  inp: number; // input tokens / mo (0 when only costs-API data exists)
  out: number; // output tokens / mo
  cur: number; // current monthly cost (USD)
  conf: number; // confidence 0-1, drives conservative reduction factors
}

const hasTokenData = (row: OpenAICostRow) => row.inp > 0 || row.out > 0;

/** Rules 1/3: reprice the row's tokens at GPT-4o-mini rates. */
export function costMiniDowngrade(row: OpenAICostRow): number {
  const mini = prOpenAI("gpt-4o-mini");
  return (row.inp / 1e6) * mini.i + (row.out / 1e6) * mini.o;
}

/** Rule 5 (and Downgrade → GPT-4o): reprice at GPT-4o rates. */
export function costGpt4oDowngrade(row: OpenAICostRow): number {
  const gpt4o = prOpenAI("gpt-4o");
  return (row.inp / 1e6) * gpt4o.i + (row.out / 1e6) * gpt4o.o;
}

/**
 * Rule 2: input reduction from tighter retrieval — 50% cut at high
 * confidence, conservative 40% otherwise.
 */
export function costRagReductionOpenAI(
  row: OpenAICostRow,
  conf: number
): number {
  const p = prOpenAI(row.model);
  const reductionFactor = conf >= 0.7 ? 0.5 : 0.6;
  return ((row.inp * reductionFactor) / 1e6) * p.i + (row.out / 1e6) * p.o;
}

/** Rule 2's reduction factor, exposed so reason/action text can cite it. */
export function ragReductionFactorOpenAI(conf: number): number {
  return conf >= 0.7 ? 0.5 : 0.6;
}

/** Rule 0: 50% of input assumed cacheable at half input price. */
export function costEnableCachingOpenAI(row: OpenAICostRow): number {
  const p = prOpenAI(row.model);
  const cacheSavings = ((row.inp * 0.5) / 1e6) * p.i * 0.5;
  return row.cur - cacheSavings;
}

/** Rules 4/4b: Batch API's 50% discount on the whole workload. */
export function costBatchDiscountOpenAI(row: OpenAICostRow): number {
  return row.cur * 0.5;
}

/** Rule 8: 25% input-token reduction from tighter prompts. */
export function costPromptTrim(row: OpenAICostRow): number {
  const p = prOpenAI(row.model);
  return ((row.inp * 0.75) / 1e6) * p.i + (row.out / 1e6) * p.o;
}

/** Rules 0b/6: conservative 10% optimization potential on the workload. */
export function costTenPercentTrim(row: OpenAICostRow): number {
  return row.cur * 0.9;
}

/** Rule 7: reprice legacy GPT-4 tokens at GPT-4o rates (may exceed cur). */
export function costLegacyGpt4Upgrade(row: OpenAICostRow): number {
  const gpt4o = prOpenAI("gpt-4o");
  return (row.inp / 1e6) * gpt4o.i + (row.out / 1e6) * gpt4o.o;
}

/**
 * Rule 9: reprice at the newest comparable model; never above current cost
 * (an upgrade is recommended for quality even when it isn't cheaper).
 */
export function costModelUpgradeOpenAI(row: OpenAICostRow): number {
  const newer = upgradeTargetOpenAI(row.model);
  const newerCost = (row.inp / 1e6) * newer.i + (row.out / 1e6) * newer.o;
  return Math.min(row.cur, newerCost);
}

/** The newest comparable model's pricing entry, for reason/action text. */
export function upgradeTargetOpenAI(model: string) {
  const m = (model || "").toLowerCase();
  const isO1 = m.includes("o1") && !m.includes("o3");
  const isGPT4 = m.includes("gpt-4") && !m.includes("gpt-4o");
  return isO1
    ? prOpenAI("o3")
    : isGPT4
      ? prOpenAI("gpt-4o")
      : prOpenAI("gpt-4o-mini");
}

/**
 * Category dispatcher for the consensus path: given an LLM-proposed category
 * and the row's real metrics, return the deterministic optimized monthly cost,
 * or null when that category can't be costed for that row (e.g. token-based
 * repricing without token data).
 */
export function optimizedCostOpenAI(
  cat: OpenAICategory,
  row: OpenAICostRow
): number | null {
  switch (cat) {
    case OpenAICategory.MODEL_DOWNGRADE_MINI:
      return hasTokenData(row) ? costMiniDowngrade(row) : null;
    case OpenAICategory.MODEL_DOWNGRADE_4O:
    case OpenAICategory.REASONING_MODEL_OVERKILL:
      return hasTokenData(row) ? costGpt4oDowngrade(row) : null;
    case OpenAICategory.RAG_OPTIMIZATION:
      return row.inp > 0 ? costRagReductionOpenAI(row, row.conf) : null;
    case OpenAICategory.PROMPT_CACHING:
      return row.inp > 0 ? costEnableCachingOpenAI(row) : null;
    case OpenAICategory.PROMPT_OPTIMIZATION:
      return row.inp > 0 ? costPromptTrim(row) : null;
    case OpenAICategory.BATCH_API_MIGRATION:
      return row.cur > 0 ? costBatchDiscountOpenAI(row) : null;
    case OpenAICategory.HIGH_IMPACT_OPPORTUNITY:
      return row.cur > 0 ? costTenPercentTrim(row) : null;
    case OpenAICategory.MODEL_UPGRADE:
      return hasTokenData(row) ? costModelUpgradeOpenAI(row) : null;
    default:
      // No deterministic formula (e.g. Project Organization) — the caller
      // decides whether a zero-savings finding survives.
      return null;
  }
}
