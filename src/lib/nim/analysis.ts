/* ═══════════════════ NVIDIA NIM — LLM-GUIDED ANALYSIS ═══════════════════ */
/*
 * AI augmentation layer over the deterministic rule engines (findIssues /
 * findIssuesOpenAI). The LLM's job is detection and explanation ONLY: it
 * proposes {row, category, severity, confidence, reason, action}. Every
 * dollar figure is computed here from the row's real metrics via the vendor
 * costing modules — the model never emits a savings number.
 *
 * When the AI toggle is on, BOTH engines run and their findings merge with
 * per-finding provenance (source: "rules" | "llm" | "both").
 */

import type {
  AnalysisEngine,
  Finding,
  LlmUsage,
  TemporalPattern,
} from "@/types";
import { AnthropicCategory, OpenAICategory, Severity } from "@/types/analysis";
import { optimizedCostAnthropic } from "@/lib/anthropic/costing";
import { optimizedCostOpenAI } from "@/lib/openai/costing";
import { KEEP_ZERO_SAVINGS, capRowSavings, rowKeyOf } from "@/lib/savingsCap";

/** Default NIM-hosted model. OpenAI-compatible chat completions. */
export const NIM_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

/**
 * Approximate hosted price for the default NIM model ($/MTok), used only to
 * estimate what the analysis call itself cost for the ROI footer.
 */
export const NIM_PRICE_PER_MTOK = { input: 0.3, output: 0.9 };

/* ─────────────── ANALYSIS RULES (LLM guidance) ─────────────── */

export const ANALYSIS_RULES = `
1. MODEL DOWNGRADE → small model (Haiku / GPT-4o-mini)
   When: avg output tokens per request is low (<~150) over many requests, and
   input isn't huge. Pattern of classification / routing / extraction.
   Action: A/B test the small model on ~100 requests; ship if accuracy delta <2%.

2. RAG CONTEXT BLOAT
   When: input:output ratio is high (>~12:1) with large average input
   (>~5000 tok/req) and millions of input tokens/mo. Retrieval is over-fetching.
   Action: reduce top-k, add reranking, tighten chunk size. Downgrade Opus→Sonnet
   for RAG (quality is retrieval-bound, not model-bound).

3. PROMPT CACHING MISS
   When: high input volume (>~20M tok/mo) with a very low cache-read rate (<5%).
   Static prefixes (system prompt, tool defs) re-sent uncached every request.
   Action: add cache_control breakpoints on the stable prefix. ~90% off cached part.

4. CACHE WRITE INEFFICIENCY
   When: large cache-creation tokens but low reuse (reads/writes < ~1). Cache is
   invalidating before it pays back (writes cost 25% more; reads 90% less).
   Action: extend cache TTL, keep prefix stable, avoid dynamic content before the
   breakpoint.

5. BATCH API MIGRATION
   When: bursty / spiky daily traffic (high coefficient of variation), many
   zero-usage days, a weekly cadence (volume concentrated on 1-2 weekdays —
   a cron job), or steady high volume that runs flat through weekends — and
   the work isn't latency-sensitive. Traffic that dips on weekends is
   human-driven and usually NOT batchable.
   Action: move async work to the Batch API for ~50% input discount (≤24h turnaround).

6. MODEL DOWNGRADE Opus→Sonnet (or premium→mid reasoning model)
   When: a premium model handles moderate-complexity work where the mid tier is
   within ~5% quality. Action: A/B on 10% traffic, migrate if quality holds.

7. LEGACY / OLD-GENERATION MODEL
   When: an older model generation is still in use and a newer same-tier model is
   cheaper or better. Action: update the model string (usually drop-in).

8. ORG STRUCTURE (workspaces / projects)
   When: all spend is in one default workspace/project with no segmentation.
   Action: split by environment/team/product for cost attribution. (Quality/visibility
   win, savings = 0.)

Only emit a finding when the data actually supports it. Skip rows costing under
~$0.50/mo.
`.trim();

/**
 * Category values the LLM may emit per vendor. Only categories the costing
 * module can price (plus the zero-savings org/quality ones) are offered.
 */
export function validCategories(vendor: "anthropic" | "openai"): string[] {
  if (vendor === "openai") {
    return [
      OpenAICategory.MODEL_DOWNGRADE_MINI,
      OpenAICategory.MODEL_DOWNGRADE_4O,
      OpenAICategory.RAG_OPTIMIZATION,
      OpenAICategory.PROMPT_CACHING,
      OpenAICategory.PROMPT_OPTIMIZATION,
      OpenAICategory.BATCH_API_MIGRATION,
      OpenAICategory.MODEL_UPGRADE,
      OpenAICategory.REASONING_MODEL_OVERKILL,
      OpenAICategory.HIGH_IMPACT_OPPORTUNITY,
      OpenAICategory.PROJECT_ORGANIZATION,
    ];
  }
  return [
    AnthropicCategory.MODEL_DOWNGRADE_HAIKU,
    AnthropicCategory.MODEL_DOWNGRADE_SONNET,
    AnthropicCategory.RAG_OPTIMIZATION,
    AnthropicCategory.PROMPT_CACHING,
    AnthropicCategory.BATCH_API_MIGRATION,
    AnthropicCategory.MODEL_UPGRADE,
    AnthropicCategory.WORKSPACE_ORGANIZATION,
  ];
}

export function buildSystemPrompt(vendor: "anthropic" | "openai"): string {
  const small = vendor === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5";
  const mid = vendor === "openai" ? "gpt-4o" : "claude-sonnet-4-6";
  const categories = validCategories(vendor)
    .map((c) => `"${c}"`)
    .join(", ");
  return `You are TokenPilot's LLM cost-optimization analyst for ${vendor === "openai" ? "OpenAI" : "Anthropic"} API usage.

You receive a JSON array of per-row usage summaries (one row = a model used by an
API key inside a workspace/project) plus org-level context. Apply the rules below
and propose concrete, actionable findings. You DETECT and EXPLAIN only — all
dollar amounts are computed separately from the row's real usage data, so do not
mention specific dollar savings.

ANALYSIS RULES:
${ANALYSIS_RULES}

Suggested small model: ${small}. Suggested mid model: ${mid}.

Respond with ONLY a JSON object, no prose, of the form:
{
  "findings": [
    {
      "rowId": "<the id field from the input row this applies to, or \\"org\\" for org-wide structure findings>",
      "category": "one of the exact values listed below",
      "severity": "critical | warning | info",
      "confidence": 0.0,
      "reason": "1-3 sentences. Cite ONLY the actual values from THIS row.",
      "action": "concrete next step the engineer can take."
    }
  ]
}

VALID CATEGORY VALUES (use exactly one of these strings, verbatim):
${categories}

GROUNDING (critical): In "reason", quote only the real numbers from the row you are
analyzing — its monthlyCostUsd, inputTokens, cacheReadRate, avgOutputPerReq, requests,
and its own model id. NEVER repeat the threshold numbers written in the rules above
(e.g. ">20M tok/mo", "<5%", ">5000 tok/req") — those are triggers, not this row's data.
NEVER mention another row's model or numbers. If a row's real numbers don't clear a
rule's threshold, do not emit that finding for it. Do NOT state dollar amounts —
savings are priced deterministically from the row's data after you respond.

Severity guide: critical = large or urgent waste on this row; warning = meaningful
optimization; info = small or quality-only. confidence is 0-1. Emit at most one
finding per category per row.`;
}

/* ─────────────── INPUT SUMMARY (vendor-agnostic) ─────────────── */

export interface UsageSummary {
  id: string; // stable id base (e.g. apiKeyId|model|wid)
  name: string; // api key id or model
  ws: string; // workspace / project display name
  model: string;
  ml: string; // model label
  inp: number;
  out: number;
  cached: number;
  cacheCreated: number;
  reqs: number;
  activeDays: number;
  cur: number; // current monthly cost (USD), computed by caller
  temporal?: TemporalPattern;
}

export interface AnalysisContext {
  vendor: "anthropic" | "openai";
  totalSpend: number;
  workspaceCount: number;
  model?: string;
}

const EMPTY_TEMPORAL: TemporalPattern = {
  burstiness: 0,
  consistency: 0,
  batchCandidate: false,
  meanDaily: 0,
};

/** What the LLM returns per proposal — note: no savings field of any kind. */
export interface LlmProposal {
  rowId: string;
  category: string;
  severity: string;
  confidence: number;
  reason: string;
  action: string;
}

// Cap rows sent to the LLM. A large org has hundreds of model/key/workspace
// combos; sending all of them bloats the prompt and the model's runtime (the
// free NIM endpoint times out). Savings concentrate in the priciest rows, so
// keep the top N by cost. ponytail: raise if the long tail ever matters.
const MAX_ROWS = 30;

/** Build the compact, number-rich payload the model reasons over. */
function summarize(rows: UsageSummary[]) {
  return rows
    .filter((r) => r.cur >= 0.5 && (r.inp > 0 || r.out > 0))
    .sort((a, b) => b.cur - a.cur)
    .slice(0, MAX_ROWS)
    .map((r) => {
      const ratio = r.out > 0 ? +(r.inp / r.out).toFixed(1) : 0;
      const cacheRate =
        r.inp + r.cached > 0 ? +(r.cached / (r.inp + r.cached)).toFixed(3) : 0;
      return {
        id: r.id,
        model: r.model,
        workspace: r.ws,
        monthlyCostUsd: +r.cur.toFixed(2),
        inputTokens: r.inp,
        outputTokens: r.out,
        cacheReadTokens: r.cached,
        cacheWriteTokens: r.cacheCreated,
        requests: r.reqs,
        avgInputPerReq: r.reqs > 0 ? Math.round(r.inp / r.reqs) : 0,
        avgOutputPerReq: r.reqs > 0 ? Math.round(r.out / r.reqs) : 0,
        inputOutputRatio: ratio,
        cacheReadRate: cacheRate,
        activeDays: r.activeDays,
        burstiness: r.temporal ? +r.temporal.burstiness.toFixed(2) : undefined,
        batchCandidate: r.temporal?.batchCandidate,
      };
    });
}

function toSeverity(s: string): Severity {
  switch ((s || "").toLowerCase()) {
    case "critical":
      return Severity.CRITICAL;
    case "warning":
      return Severity.WARNING;
    default:
      return Severity.INFO;
  }
}

const slug = (c: string) => c.replace(/[^a-z0-9]/gi, "-").toLowerCase();

// Looser form for matching LLM-emitted category strings: consecutive
// separators collapse so "→" and "->" normalize identically.
const canon = (c: string) => slug(c).replace(/-+/g, "-");

// Cost tier rank from a model id/label — lower = cheaper. Heuristic, but enough
// to catch the LLM mislabelling an upgrade as a "downgrade". ponytail: extend
// the regexes if a new tier shows up.
function tierRank(s: string): number {
  const t = (s || "").toLowerCase();
  if (/haiku|mini|nano|small|flash|lite|8b/.test(t)) return 0;
  if (/sonnet|gpt-4o|[^a-z]4o|medium|70b/.test(t)) return 1;
  if (/opus|gpt-4(?!o)|gpt-5|ultra|large|405b/.test(t)) return 2;
  return 1; // unknown → neutral mid tier
}

// If a category describes a model downgrade, return the target tier rank, else
// null. e.g. "Model Downgrade → Sonnet" → 1.
function downgradeTargetRank(category: string): number | null {
  if (!/downgrad/i.test(category || "")) return null;
  const target = (category.split(/→|->/).pop() || category).trim();
  return tierRank(target);
}

interface Candidate {
  finding: Finding;
  rowId: string;
  sav: number;
  conf: number;
  isDowngrade: boolean;
}

/**
 * Resolve an LLM-emitted category string to the vendor's canonical enum value.
 * Tolerates "->" vs "→" and case drift; returns null for anything not in the
 * fixed category set.
 */
export function resolveCategory(
  vendor: "anthropic" | "openai",
  category: string
): AnthropicCategory | OpenAICategory | null {
  const want = canon(category || "");
  for (const c of validCategories(vendor)) {
    if (canon(c) === want) return c as AnthropicCategory | OpenAICategory;
  }
  return null;
}

/**
 * Price the LLM's proposals deterministically and turn them into Findings.
 * The LLM contributes detection + explanation; the costing module contributes
 * every number. Guardrails:
 *   1. Categories outside the vendor's fixed enum are dropped.
 *   2. "Downgrades" whose target isn't actually cheaper than the row's model
 *      are dropped (tier sanity).
 *   3. At most one downgrade per row (no Sonnet AND Haiku at once).
 *   4. Proposals whose category can't be costed for that row are dropped —
 *      except zero-savings org/quality categories, which keep savings 0.
 * Exported for testing.
 */
export function priceLlmFindings(
  llm: LlmProposal[],
  rows: UsageSummary[],
  ctx: AnalysisContext
): Finding[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  for (const f of llm || []) {
    if (!f || !f.reason) continue;
    const cat = resolveCategory(ctx.vendor, f.category);
    if (!cat) continue; // guardrail 1: unknown category

    const dedupeKey = `${f.rowId}|${slug(cat)}`;
    if (seen.has(dedupeKey)) continue;

    const r = byId.get(f.rowId);
    const cur = r ? r.cur : ctx.totalSpend;
    const conf = Math.max(0, Math.min(f.confidence ?? 0.5, 1));

    // Guardrail 2: a "downgrade" to an equal/pricier tier isn't a saving.
    const targetRank = downgradeTargetRank(cat);
    const isDowngrade = targetRank !== null;
    if (r && isDowngrade && targetRank! >= tierRank(r.model || r.ml)) continue;

    // Deterministic pricing — the only source of dollar figures.
    const priced = r
      ? ctx.vendor === "openai"
        ? optimizedCostOpenAI(cat as OpenAICategory, {
            model: r.model || r.ml || "",
            inp: r.inp,
            out: r.out,
            cur,
            conf,
          })
        : optimizedCostAnthropic(cat as AnthropicCategory, {
            model: r.model,
            inp: r.inp,
            out: r.out,
            cached: r.cached,
            cacheCreated: r.cacheCreated,
            cur,
            conf,
          })
      : null;

    let sav: number;
    let opt: number;
    if (priced === null) {
      // Guardrail 4: uncostable — only org/quality categories survive, at $0.
      if (!KEEP_ZERO_SAVINGS.test(cat)) continue;
      sav = 0;
      opt = cur;
    } else {
      sav = Math.max(0, cur - priced);
      opt = cur - sav;
      // A cost finding the pricing says saves nothing is noise.
      if (sav <= 0 && !KEEP_ZERO_SAVINGS.test(cat)) continue;
    }

    seen.add(dedupeKey);
    const ratio = r && r.out > 0 ? r.inp / r.out : 0;
    const cr = r && r.inp + r.cached > 0 ? r.cached / (r.inp + r.cached) : 0;
    const pct = cur > 0 ? Math.round((sav / cur) * 100) : 0;

    candidates.push({
      rowId: f.rowId,
      sav,
      conf,
      isDowngrade,
      finding: {
        id: `${f.rowId}-${slug(cat)}`,
        name: r ? r.name : "Organization",
        ws: r ? r.ws : "All workspaces",
        model: r ? r.model : "N/A",
        ml: r ? r.ml : cat,
        inp: r?.inp ?? 0,
        out: r?.out ?? 0,
        cached: r?.cached ?? 0,
        reqs: r?.reqs ?? 0,
        ao: r && r.reqs > 0 ? Math.round(r.out / r.reqs) : 0,
        ai: r && r.reqs > 0 ? Math.round(r.inp / r.reqs) : 0,
        ratio,
        cr,
        cur,
        opt,
        sav,
        reason: f.reason,
        action: f.action || "",
        sev: toSeverity(f.severity),
        cat,
        conf,
        impact:
          sav > 0 ? `$${sav.toFixed(2)}/mo (${pct}%)` : "Quality improvement",
        activeDays: r?.activeDays ?? 0,
        temporal: r?.temporal ?? EMPTY_TEMPORAL,
        source: "llm",
      },
    });
  }

  // Guardrail 3: at most one downgrade per row — keep the highest-savings one.
  const bestDowngrade = new Map<string, Candidate>();
  for (const c of candidates) {
    if (!c.isDowngrade) continue;
    const cur = bestDowngrade.get(c.rowId);
    if (!cur || c.sav > cur.sav || (c.sav === cur.sav && c.conf > cur.conf)) {
      bestDowngrade.set(c.rowId, c);
    }
  }
  const kept = candidates.filter(
    (c) => !c.isDowngrade || bestDowngrade.get(c.rowId) === c
  );

  return kept.map((c) => c.finding).sort(bySeverityThenSavings);
}

/* ─────────────── CONSENSUS MERGE ─────────────── */

const sv: Record<Severity, number> = {
  [Severity.CRITICAL]: 0,
  [Severity.WARNING]: 1,
  [Severity.INFO]: 2,
  [Severity.OK]: 3,
};

function bySeverityThenSavings(a: Finding, b: Finding): number {
  return sv[a.sev] !== sv[b.sev] ? sv[a.sev] - sv[b.sev] : b.sav - a.sav;
}

// A finding's merge key: the row it belongs to (see rowKeyOf — org-level
// findings collapse to a shared "org" row) plus its category, so both
// engines' versions of the same insight merge into one.
export function consensusKey(f: Finding): string {
  return `${rowKeyOf(f)}|${slug(f.cat as string)}`;
}

/**
 * Merge both engines' findings by (row, category):
 *  - found by both  → one finding, rule's text kept, source "both",
 *                     confidence = min(0.95, max(ruleConf, llmConf) + 0.1)
 *  - rules only     → unchanged, source "rules"
 *  - LLM only       → LLM's text, deterministic price, source "llm"
 */
export function mergeConsensus(
  ruleFindings: Finding[],
  llmFindings: Finding[]
): Finding[] {
  const llmByKey = new Map(llmFindings.map((f) => [consensusKey(f), f]));
  const merged: Finding[] = [];

  for (const rf of ruleFindings) {
    const key = consensusKey(rf);
    const lf = llmByKey.get(key);
    if (lf) {
      llmByKey.delete(key);
      merged.push({
        ...rf,
        source: "both",
        conf: Math.min(0.95, Math.max(rf.conf, lf.conf) + 0.1),
      });
    } else {
      merged.push({ ...rf, source: rf.source ?? "rules" });
    }
  }

  for (const lf of llmByKey.values()) {
    merged.push({ ...lf, source: "llm" });
  }

  // Rule and LLM findings were each capped alone; their union can still claim
  // more than a row spends, so the cap runs again on the merged set.
  return capRowSavings(merged).sort(bySeverityThenSavings);
}

/** Extract a JSON object even if the model wraps it in prose / code fences. */
function parseFindings(content: string): LlmProposal[] {
  let txt = content.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start >= 0 && end > start) txt = txt.slice(start, end + 1);
  const parsed = JSON.parse(txt);
  return Array.isArray(parsed) ? parsed : parsed.findings || [];
}

export interface LlmAnalysisResult {
  findings: Finding[];
  usage?: LlmUsage;
}

/** Outcome of an analysis run: findings plus which engine produced them. */
export interface AnalysisOutcome {
  findings: Finding[];
  engine: AnalysisEngine;
  notice?: string;
  llmUsage?: LlmUsage;
}

export const LLM_FALLBACK_NOTICE =
  "LLM unavailable, showing deterministic analysis";

/**
 * Consensus run: the rule engine always runs first (synchronously), then the
 * LLM augments it. On success the two merge with per-finding provenance
 * (engine "hybrid"); on any LLM failure the report degrades to the rules-only
 * findings with a notice — it is never empty, because the rules already ran.
 */
export async function analyzeWithFallback(
  llm: () => Promise<LlmAnalysisResult>,
  rules: () => Finding[]
): Promise<AnalysisOutcome> {
  const ruleFindings = rules();
  try {
    const res = await llm();
    return {
      findings: mergeConsensus(ruleFindings, res.findings),
      engine: "hybrid",
      llmUsage: res.usage,
    };
  } catch (e) {
    console.warn("LLM augmentation failed, showing rule-engine findings:", e);
    return {
      findings: ruleFindings,
      engine: "rules",
      notice: LLM_FALLBACK_NOTICE,
    };
  }
}

/**
 * Run LLM-guided detection via NVIDIA NIM and price each proposal with the
 * vendor costing module. Returns Findings in the same shape as the rule
 * engines (source "llm"), plus the NIM call's own token usage when the
 * response reports it. Throws on transport/parse failure so callers can
 * degrade to rules-only (see analyzeWithFallback).
 */
export async function findIssuesLLM(
  rows: UsageSummary[],
  ctx: AnalysisContext
): Promise<LlmAnalysisResult> {
  const payload = summarize(rows);
  if (payload.length === 0) return { findings: [] };

  const body = {
    model: ctx.model || NIM_DEFAULT_MODEL,
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt(ctx.vendor) },
      {
        role: "user",
        content: JSON.stringify({
          orgContext: {
            vendor: ctx.vendor,
            totalMonthlySpendUsd: +ctx.totalSpend.toFixed(2),
            workspaceCount: ctx.workspaceCount,
          },
          rows: payload,
        }),
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch("/api/nim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Fail fast rather than hanging on a slow NIM model.
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error(
        "NIM request timed out (120s) — the model is taking too long. Retry, or set NIM_BASE_URL/NIM_MODEL to a faster NIM model."
      );
    }
    throw e;
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`NIM analysis failed (${res.status}): ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("NIM returned an empty response");

  const u = data?.usage;
  const usage: LlmUsage | undefined =
    u && (u.prompt_tokens || u.completion_tokens)
      ? {
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          costUsd:
            ((u.prompt_tokens ?? 0) * NIM_PRICE_PER_MTOK.input +
              (u.completion_tokens ?? 0) * NIM_PRICE_PER_MTOK.output) /
            1_000_000,
        }
      : undefined;

  return {
    findings: priceLlmFindings(parseFindings(content), rows, ctx),
    usage,
  };
}
