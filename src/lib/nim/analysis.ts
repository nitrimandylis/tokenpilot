/* ═══════════════════ NVIDIA NIM — LLM-GUIDED ANALYSIS ═══════════════════ */
/*
 * Drop-in alternative to the hardcoded rule engines (findIssues /
 * findIssuesOpenAI). Instead of fixed thresholds, we hand a structured usage
 * summary to an LLM hosted on NVIDIA NIM and let it reason about which
 * optimizations apply. The rules below are *guidance* for the model, not code.
 *
 * The deterministic metrics (cost, savings clamping, ids) are still computed
 * here so dollar figures stay grounded and the model can't hallucinate numbers.
 */

import type { Finding, TemporalPattern } from "@/types";
import { Severity } from "@/types/analysis";

/** Default NIM-hosted model. OpenAI-compatible chat completions. */
export const NIM_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

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
   When: bursty / spiky daily traffic (high coefficient of variation) or many
   zero-usage days, and the work isn't latency-sensitive.
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

Only emit a finding when the data actually supports it. Be conservative with
savings — prefer underestimating. Skip rows costing under ~$0.50/mo.
`.trim();

export function buildSystemPrompt(vendor: "anthropic" | "openai"): string {
  const small = vendor === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5";
  const mid = vendor === "openai" ? "gpt-4o" : "claude-sonnet-4-6";
  return `You are TokenPilot's LLM cost-optimization analyst for ${vendor === "openai" ? "OpenAI" : "Anthropic"} API usage.

You receive a JSON array of per-row usage summaries (one row = a model used by an
API key inside a workspace/project) plus org-level context. Apply the rules below
and return concrete, actionable cost-savings findings.

ANALYSIS RULES:
${ANALYSIS_RULES}

Suggested small model: ${small}. Suggested mid model: ${mid}.

Respond with ONLY a JSON object, no prose, of the form:
{
  "findings": [
    {
      "rowId": "<the id field from the input row this applies to, or \\"org\\" for org-wide structure findings>",
      "category": "short label, e.g. 'Model Downgrade → Haiku', 'RAG Optimization', 'Prompt Caching', 'Batch API Migration', 'Model Upgrade', 'Workspace Organization'",
      "severity": "critical | warning | info",
      "confidence": 0.0,
      "savingsMonthly": 0.0,
      "reason": "1-3 sentences. Cite ONLY the actual values from THIS row.",
      "action": "concrete next step the engineer can take."
    }
  ]
}

GROUNDING (critical): In "reason", quote only the real numbers from the row you are
analyzing — its monthlyCostUsd, inputTokens, cacheReadRate, avgOutputPerReq, requests,
and its own model id. NEVER repeat the threshold numbers written in the rules above
(e.g. ">20M tok/mo", "<5%", ">5000 tok/req") — those are triggers, not this row's data.
NEVER mention another row's model or numbers. If a row's real numbers don't clear a
rule's threshold, do not emit that finding for it.

Severity guide: critical = >$100/mo or >20% of this row's cost; warning = meaningful
savings; info = small or quality-only. savingsMonthly is the estimated monthly USD
saved (0 for quality-only or org-structure findings) and must not exceed the row's
current monthly cost. confidence is 0-1. Emit at most one finding per category per row.`;
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

interface LlmFinding {
  rowId: string;
  category: string;
  severity: string;
  confidence: number;
  savingsMonthly: number;
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

const KEEP_ZERO_SAVINGS = /upgrade|organization|workspace|project|quality/i;

interface Candidate {
  finding: Finding;
  rowId: string;
  cur: number;
  sav: number;
  conf: number;
  isDowngrade: boolean;
}

/**
 * Merge the LLM's reasoning back onto deterministic per-row metrics, then apply
 * guardrails so a weak model can't produce contradictory or impossible advice:
 *   1. Per-finding savings clamped to [0, row cost].
 *   2. Drop "downgrades" whose target isn't actually cheaper than the row's model.
 *   3. Keep only the single best downgrade per row (no Sonnet AND Haiku at once).
 *   4. Drop zero-savings cost findings (noise); keep zero-savings quality/org ones.
 *   5. Cap cumulative savings per row at the row's spend (no >100% savings).
 * Exported for testing.
 */
export function mergeLlmFindings(
  llm: LlmFinding[],
  rows: UsageSummary[],
  ctx: AnalysisContext
): Finding[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const candidates: Candidate[] = [];

  for (const f of llm || []) {
    if (!f || !f.reason) continue;
    const r = byId.get(f.rowId);
    const cur = r ? r.cur : ctx.totalSpend;
    const sav = Math.max(0, Math.min(f.savingsMonthly || 0, cur));
    const conf = Math.max(0, Math.min(f.confidence ?? 0.5, 1));
    const category = f.category || "Optimization";

    // Guardrail 2: a "downgrade" to an equal/pricier tier isn't a saving.
    const targetRank = downgradeTargetRank(category);
    const isDowngrade = targetRank !== null;
    if (r && isDowngrade && targetRank! >= tierRank(r.model || r.ml)) continue;

    // Guardrail 4: drop zero-savings cost findings; keep quality/org ones.
    if (sav <= 0 && !KEEP_ZERO_SAVINGS.test(category)) continue;

    const ratio = r && r.out > 0 ? r.inp / r.out : 0;
    const cr = r && r.inp + r.cached > 0 ? r.cached / (r.inp + r.cached) : 0;
    const slug = category.replace(/[^a-z0-9]/gi, "-").toLowerCase();

    candidates.push({
      rowId: f.rowId,
      cur,
      sav,
      conf,
      isDowngrade,
      finding: {
        id: `${f.rowId}-${slug}`,
        name: r ? r.name : "Organization",
        ws: r ? r.ws : "All workspaces",
        model: r ? r.model : "N/A",
        ml: r ? r.ml : category,
        inp: r?.inp ?? 0,
        out: r?.out ?? 0,
        cached: r?.cached ?? 0,
        reqs: r?.reqs ?? 0,
        ao: r && r.reqs > 0 ? Math.round(r.out / r.reqs) : 0,
        ai: r && r.reqs > 0 ? Math.round(r.inp / r.reqs) : 0,
        ratio,
        cr,
        cur,
        opt: cur, // filled after capping
        sav, // filled after capping
        reason: f.reason,
        action: f.action || "",
        sev: toSeverity(f.severity),
        cat: category as Finding["cat"],
        conf,
        impact: "",
        activeDays: r?.activeDays ?? 0,
        temporal: r?.temporal ?? EMPTY_TEMPORAL,
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

  // Guardrail 5: cap cumulative savings per row at its spend (highest first).
  const headroom = new Map<string, number>();
  for (const c of [...kept].sort((a, b) => b.sav - a.sav)) {
    const left = headroom.get(c.rowId) ?? c.cur;
    const sav = Math.min(c.sav, Math.max(0, left));
    headroom.set(c.rowId, left - sav);
    c.finding.sav = sav;
    c.finding.opt = Math.max(0, c.cur - sav);
    const pct = c.cur > 0 ? Math.round((sav / c.cur) * 100) : 0;
    c.finding.impact =
      sav > 0 ? `$${sav.toFixed(2)}/mo (${pct}%)` : "Quality improvement";
  }

  // Guardrail 4 (final pass): a cost finding the cumulative cap zeroed out is
  // noise, not a "quality improvement" — drop it. Quality/org findings stay.
  const final = kept.filter(
    (c) => c.finding.sav > 0 || KEEP_ZERO_SAVINGS.test(c.finding.cat as string)
  );

  // Same severity+savings ordering the hardcoded engine uses.
  const sv: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.WARNING]: 1,
    [Severity.INFO]: 2,
    [Severity.OK]: 3,
  };
  return final
    .map((c) => c.finding)
    .sort((a, b) =>
      sv[a.sev] !== sv[b.sev] ? sv[a.sev] - sv[b.sev] : b.sav - a.sav
    );
}

/** Extract a JSON object even if the model wraps it in prose / code fences. */
function parseFindings(content: string): LlmFinding[] {
  let txt = content.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) txt = fence[1].trim();
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start >= 0 && end > start) txt = txt.slice(start, end + 1);
  const parsed = JSON.parse(txt);
  return Array.isArray(parsed) ? parsed : parsed.findings || [];
}

/**
 * Run LLM-guided analysis via NVIDIA NIM. Returns Findings in the same shape as
 * the hardcoded engines. Throws on transport/parse failure so callers can fall
 * back to the rule engine.
 */
export async function findIssuesLLM(
  rows: UsageSummary[],
  ctx: AnalysisContext
): Promise<Finding[]> {
  const payload = summarize(rows);
  if (payload.length === 0) return [];

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

  return mergeLlmFindings(parseFindings(content), rows, ctx);
}
