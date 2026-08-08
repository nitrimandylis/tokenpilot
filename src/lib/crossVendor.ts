/* ═══════════════════ CROSS-VENDOR COMPARISON ═══════════════════ */
/*
 * Both pricing tables live in this repo, so "what would this exact workload
 * cost on the other vendor?" is answerable without a single extra API call —
 * and it's the one finding a single-vendor tool structurally cannot make.
 *
 * This module owns the tier mapping (which model on vendor B stands in for a
 * model on vendor A) and the comparison math. Both engines import it; neither
 * reaches into the other vendor's pricing table directly.
 *
 * Two deliberate constraints:
 *
 * 1. BOTH sides are priced from the pricing tables (`tc` / `tcOpenAI`) on the
 *    row's input and output tokens. The OpenAI engine normally prefers the
 *    real billed figure from the Costs API (`r.cost`), but the Anthropic side
 *    has no equivalent — mixing billed spend against table pricing would
 *    compare two different things. `r.cost` remains the source of truth for
 *    `cur` on every other finding; only this comparison overrides it.
 *
 * 2. The finding never contributes savings. It is an INFO-only repricing of
 *    identical token volumes, not an optimization the user can bank, so `sav`
 *    is always 0 and `opt` always equals `cur`.
 */

import type { Finding, FindingSignal } from "@/types";
import {
  AnthropicCategory,
  AnthropicModelTier,
  OpenAICategory,
  OpenAIModelTier,
  Severity,
} from "@/types/analysis";
import { confidenceScore } from "@/lib/anthropic/analysis";
import { pr, tc } from "@/lib/anthropic/pricing";
import { prOpenAI, tcOpenAI } from "@/lib/openai/pricing";
import { $ } from "@/lib/formatters";

export type Vendor = "anthropic" | "openai";

/** Everything the comparison needs from one aggregated usage row. */
export interface CrossVendorRow {
  model: string;
  inp: number; // input tokens / mo
  out: number; // output tokens / mo
  cached?: number; // cache read tokens / mo (Anthropic only)
}

/** Org spend below this is too small for a migration argument to mean much. */
export const MIN_ORG_SPEND = 50;

/** A delta this thin reads as "roughly the same" — noise, not a finding. */
export const MIN_DELTA_SHARE = 0.1;

/* ─── TIER MAPPING ─── */

/**
 * Anthropic → OpenAI: the current-generation OpenAI model in the same
 * capability class. Driven by the pricing table's tier, so dated model ids
 * ("claude-opus-4-6-20260101") map the same as bare ones.
 */
export function anthropicToOpenAI(model: string): string {
  switch (pr(model).t) {
    case AnthropicModelTier.OPUS:
      return "o3";
    case AnthropicModelTier.HAIKU:
      return "gpt-4o-mini";
    default:
      return "gpt-4o";
  }
}

/**
 * OpenAI → Anthropic: the current-generation Claude model in the same
 * capability class.
 *
 * The mini variants are matched by name before falling back to the pricing
 * tier, because `OpenAIModelTier` lumps o1 with o1-mini and o3 with o3-mini —
 * and because `prOpenAI` resolves "gpt-4o-mini" through its "gpt-4o" entry,
 * so its tier can't distinguish the two either.
 */
export function openAIToAnthropic(model: string): string {
  const k = (model || "").toLowerCase();
  if (k.includes("gpt-4o-mini") || k.includes("gpt-3.5")) return "haiku-4-5";
  if (k.includes("o1-mini") || k.includes("o3-mini")) return "sonnet-4-6";

  switch (prOpenAI(model).t) {
    case OpenAIModelTier.O1:
    case OpenAIModelTier.O3:
      return "opus-4-6";
    case OpenAIModelTier.GPT4O_MINI:
    case OpenAIModelTier.GPT3_5:
      return "haiku-4-5";
    default:
      // GPT-4o, GPT-4 Turbo, GPT-4, GPT-4 32k, and anything unrecognized.
      return "sonnet-4-6";
  }
}

/** The counterpart model for a row, in whichever direction applies. */
export function counterpartModel(vendor: Vendor, model: string): string {
  return vendor === "anthropic"
    ? anthropicToOpenAI(model)
    : openAIToAnthropic(model);
}

/* ─── COMPARISON MATH ─── */

/** One capability class: what the org spends there now vs. on the other side. */
export interface CrossVendorTier {
  /** The counterpart model id — the anchor both sides are grouped by. */
  key: string;
  ownLabel: string;
  otherLabel: string;
  own: number; // $/mo on the current vendor
  other: number; // $/mo on the counterpart vendor
}

export interface CrossVendorComparison {
  vendor: Vendor;
  cur: number; // org total on the current vendor, table-priced
  alt: number; // org total on the counterpart vendor, table-priced
  delta: number; // alt - cur; negative means the other vendor is cheaper
  /** Tier classes carrying spend, biggest first. */
  tiers: CrossVendorTier[];
  /** Share of org spend priced from a real table entry (not the g:0 default). */
  directMatchShare: number;
  /** Org-wide cache read rate; always 0 for OpenAI, which exposes no stats. */
  cacheRate: number;
}

/*
 * KNOWN UPSTREAM ISSUE (pre-existing, not introduced here): `prOpenAI` walks
 * MP_OPENAI in insertion order with `k.includes(key)`, so "gpt-4o-mini"
 * matches the "gpt-4o" entry first and prices at $2.50/$10 instead of
 * $0.15/$0.60 — likewise "o1-mini" → o1, "o3-mini" → o3, "gpt-4-32k" → gpt-4.
 *
 * That inflates the Haiku ↔ GPT-4o-mini class in both directions and can flip
 * the sign of its per-tier delta. It is left alone deliberately: `prOpenAI`
 * feeds every existing OpenAI rule's `cur` and savings, so correcting it here
 * would move the whole engine and the calibration sweep with it. Pricing both
 * sides through the same resolver at least keeps each printed label and its
 * dollar figure consistent with one another. Fix belongs in its own change.
 */
const priceOn = (vendor: Vendor, model: string, inp: number, out: number) =>
  vendor === "anthropic" ? tc(model, inp, out) : tcOpenAI(model, inp, out);

const labelOn = (vendor: Vendor, model: string) =>
  vendor === "anthropic" ? pr(model).l : prOpenAI(model).l;

const generationOn = (vendor: Vendor, model: string) =>
  vendor === "anthropic" ? pr(model).g : prOpenAI(model).g;

/**
 * Reprice every row on the other vendor's nearest-equivalent tier and roll the
 * result up per capability class, then to an org total.
 *
 * Cached and cache-created tokens are ignored throughout, matching how `tc()`
 * computes `cur` for every other finding.
 */
export function compareVendors(
  vendor: Vendor,
  rows: CrossVendorRow[]
): CrossVendorComparison {
  const other: Vendor = vendor === "anthropic" ? "openai" : "anthropic";

  // Per class: own/other spend, plus the own-side model carrying the most of
  // it, which supplies the class label in the reason text.
  const classes = new Map<
    string,
    { own: number; other: number; topModel: string; topSpend: number }
  >();

  let cur = 0;
  let alt = 0;
  let directMatched = 0;
  let inp = 0;
  let cached = 0;

  for (const r of rows) {
    inp += r.inp;
    cached += r.cached ?? 0;

    const ownCost = priceOn(vendor, r.model, r.inp, r.out);
    if (ownCost <= 0) continue;

    const key = counterpartModel(vendor, r.model);
    const otherCost = priceOn(other, key, r.inp, r.out);

    cur += ownCost;
    alt += otherCost;
    if (generationOn(vendor, r.model) > 0) directMatched += ownCost;

    const c = classes.get(key) ?? {
      own: 0,
      other: 0,
      topModel: r.model,
      topSpend: 0,
    };
    c.own += ownCost;
    c.other += otherCost;
    if (ownCost > c.topSpend) {
      c.topSpend = ownCost;
      c.topModel = r.model;
    }
    classes.set(key, c);
  }

  const tiers: CrossVendorTier[] = [...classes.entries()]
    .map(([key, c]) => ({
      key,
      ownLabel: labelOn(vendor, c.topModel),
      otherLabel: labelOn(other, key),
      own: c.own,
      other: c.other,
    }))
    .sort((a, b) => b.own - a.own);

  return {
    vendor,
    cur,
    alt,
    delta: alt - cur,
    tiers,
    directMatchShare: cur > 0 ? directMatched / cur : 0,
    cacheRate: inp + cached > 0 ? cached / (inp + cached) : 0,
  };
}

/* ─── FINDING ─── */

const VENDOR_NAME: Record<Vendor, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
};

/** Signed percentage of a tier's own spend, e.g. "-65%" / "+41%". */
function tierDelta(own: number, other: number): string {
  if (own <= 0) return "n/a";
  const pct = Math.round(((other - own) / own) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function buildReason(c: CrossVendorComparison): string {
  return c.tiers
    .map((t, i) => {
      const suffix = i === 0 ? "/mo" : "";
      return `${t.ownLabel} ${$(t.own)}${suffix} → ${t.otherLabel} ${$(
        t.other
      )}${suffix} (${tierDelta(t.own, t.other)}).`;
    })
    .join(" ");
}

function buildAction(c: CrossVendorComparison): string {
  const other = VENDOR_NAME[c.vendor === "anthropic" ? "openai" : "anthropic"];
  const parts = [
    `This reprices identical token volumes on ${other}'s nearest-equivalent tiers. It is a price comparison, not a quality claim — equivalent tier does not mean equivalent output, and only your own evals can settle that.`,
    `Migration cost is excluded: prompt rewrites, tool-calling differences, and the re-evaluation run needed before you would trust the swap.`,
  ];

  // Cache economics don't survive the move intact: Anthropic reads cached
  // input at 90% off, OpenAI's automatic caching at 50% off. A cache-heavy
  // workload therefore keeps less of the delta than a table repricing shows.
  if (c.cacheRate >= 0.1) {
    parts.push(
      `${Math.round(c.cacheRate * 100)}% of your input is served from cache. Anthropic cache reads are 90% off while OpenAI automatic caching is 50% off, so a cache-heavy workload like this keeps less of the delta than these numbers show.`
    );
  }

  return parts.join(" ");
}

/**
 * The org-level cross-vendor finding, or null when the gate rejects it: too
 * little spend for the argument to matter, or a delta thin enough that the
 * honest answer is "roughly the same".
 *
 * Always INFO, always zero savings — see the header note.
 */
export function crossVendorFinding(
  vendor: Vendor,
  rows: CrossVendorRow[]
): Finding | null {
  const c = compareVendors(vendor, rows);

  if (c.cur < MIN_ORG_SPEND) return null;
  if (Math.abs(c.delta) < c.cur * MIN_DELTA_SHARE) return null;

  const signals: FindingSignal[] = [
    {
      weight: 0.3,
      met: Math.abs(c.delta) >= c.cur * 0.4,
      label: "delta ≥ 40% of org spend",
    },
    { weight: 0.25, met: c.cur >= 500, label: "org spend ≥ $500/mo" },
    {
      weight: 0.25,
      met: c.directMatchShare >= 0.8,
      label: "80%+ of spend on directly mapped tiers",
    },
    { weight: 0.2, met: c.cacheRate < 0.1, label: "cache rate < 10%" },
  ];
  const conf = confidenceScore(signals);

  const totals = rows.reduce(
    (a, r) => ({
      inp: a.inp + r.inp,
      out: a.out + r.out,
      cached: a.cached + (r.cached ?? 0),
    }),
    { inp: 0, out: 0, cached: 0 }
  );

  return {
    id: "cross-vendor-comparison",
    name: "Organization",
    ws: vendor === "anthropic" ? "All workspaces" : "All projects",
    model: "N/A",
    ml: "Cross-Vendor Comparison",
    inp: totals.inp,
    out: totals.out,
    cached: totals.cached,
    reqs: 0,
    ao: 0,
    ai: 0,
    ratio: totals.out > 0 ? totals.inp / totals.out : 0,
    cr: c.cacheRate,
    cur: c.cur,
    opt: c.cur,
    sav: 0,
    reason: buildReason(c),
    action: buildAction(c),
    sev: Severity.INFO,
    cat:
      vendor === "anthropic"
        ? AnthropicCategory.CROSS_VENDOR_COMPARISON
        : OpenAICategory.CROSS_VENDOR_COMPARISON,
    conf,
    impact: `${c.delta < 0 ? "-" : "+"}${$(Math.abs(c.delta))}/mo if migrated (not in savings total)`,
    activeDays: 0,
    temporal: {
      burstiness: 0,
      consistency: 0,
      batchCandidate: false,
      meanDaily: 0,
    },
    source: "rules",
    signals,
  };
}
