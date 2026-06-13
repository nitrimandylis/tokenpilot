/* ═══════════════════ OpenAI ANALYSIS ENGINE ═══════════════════ */

import type { Finding } from "@/types";
import { OpenAICategory, Severity } from "@/types/analysis";
import { prOpenAI, tcOpenAI } from "./pricing";
import { $, P } from "@/lib/formatters";
import type { OpenAIUsageData } from "./api";

/* ═══════════════════ SERVICE TYPES ═══════════════════ */

export enum OpenAIService {
  COMPLETIONS = "completions",
  AUDIO_SPEECHES = "audio_speeches",
  AUDIO_TRANSCRIPTIONS = "audio_transcriptions",
  IMAGES = "images",
  MODERATIONS = "moderations",
  VECTOR_STORES = "vector_stores",
  CODE_INTERPRETER = "code_interpreter_sessions",
  EMBEDDINGS = "embeddings",
}

export interface OpenAIAggregatedRow {
  model: string;
  project_id?: string;
  line_item?: string; // API service type (e.g., "GPT-4o", "Embeddings")
  cost: number; // Actual cost in USD
  activeDays: number;
  // Token fields - may be 0 if using costs API
  inp: number; // context/input tokens
  out: number; // generated/output tokens
  reqs: number; // requests
}

/**
 * Aggregates OpenAI costs data by model/line_item and project
 * Uses actual cost data from the Costs API instead of token counts
 * @param costs - OpenAI costs data from API
 * @returns Array of aggregated rows with actual costs
 */
export function aggOpenAICosts(costs: any): OpenAIAggregatedRow[] {
  const m: Record<string, OpenAIAggregatedRow & { days: Set<string> }> = {};

  if (!costs || !costs.data) {
    return [];
  }

  for (const bucket of costs.data) {
    if (!bucket.results || !Array.isArray(bucket.results)) continue;

    for (const result of bucket.results) {
      // Use line_item if available, otherwise use project name
      const lineItem = result.line_item || result.project_name || "API Usage";
      const projectId = result.project_id;
      const k = `${lineItem}|${projectId || "default"}`;

      if (!m[k]) {
        m[k] = {
          model: lineItem,
          line_item: lineItem,
          project_id: projectId,
          cost: 0,
          inp: 0,
          out: 0,
          reqs: 0,
          days: new Set(),
          activeDays: 0,
        };
      }

      m[k].cost += result.amount?.value || 0;

      // Track days with activity
      if (bucket.start_time) {
        const day = new Date(bucket.start_time * 1000)
          .toISOString()
          .split("T")[0];
        m[k].days.add(day);
      }
    }
  }

  const result = Object.values(m).map((r) => ({
    ...r,
    activeDays: r.days.size,
    days: undefined,
  })) as OpenAIAggregatedRow[];

  return result;
}

/**
 * Aggregates OpenAI usage data by model, project, and API key
 * @param usage - OpenAI usage data from API
 * @returns Array of aggregated rows
 */
export function aggOpenAI(usage: OpenAIUsageData): OpenAIAggregatedRow[] {
  const m: Record<string, OpenAIAggregatedRow & { days: Set<string> }> = {};

  // Handle combined results from multiple endpoints
  for (const d of usage.data || []) {
    const model = d.model || d.snapshot_id || "unknown";
    const service = d.service || OpenAIService.COMPLETIONS;
    const k = `${model}|${service}|${d.project_id || "all"}`;

    if (!m[k]) {
      m[k] = {
        model,
        line_item: service,
        project_id: d.project_id,
        cost: 0,
        inp: 0,
        out: 0,
        reqs: 0,
        days: new Set(),
        activeDays: 0,
      };
    }

    // Aggregate tokens and requests based on service type
    if (service === OpenAIService.AUDIO_TRANSCRIPTIONS) {
      // Audio transcriptions don't have tokens, use seconds for cost
      m[k].reqs += d.num_model_requests || 0;
      if (d.seconds) {
        // Whisper pricing: $0.006 per minute
        const minutes = d.seconds / 60;
        m[k].cost += minutes * 0.006;
      }
    } else {
      // Completions and other services use tokens
      // Use uncached tokens for input cost calculation (cached tokens cost less)
      m[k].inp += d.input_uncached_tokens || d.input_tokens || 0;
      m[k].out += d.output_tokens || d.output_text_tokens || 0;
      m[k].reqs += d.num_model_requests || 0;
    }

    // Track days with activity
    if (d.bucket_start_time) {
      const day = new Date(d.bucket_start_time * 1000)
        .toISOString()
        .split("T")[0];
      m[k].days.add(day);
    } else if (d.aggregation_timestamp) {
      const day = new Date(d.aggregation_timestamp * 1000)
        .toISOString()
        .split("T")[0];
      m[k].days.add(day);
    }
  }

  return Object.values(m).map((r) => ({
    ...r,
    activeDays: r.days.size,
    days: undefined,
  })) as OpenAIAggregatedRow[];
}

/**
 * Multi-signal confidence scoring
 */
function confidenceScore(
  signals: Array<{ weight: number; met: boolean }>
): number {
  let total = 0;
  let met = 0;
  for (const s of signals) {
    total += s.weight;
    if (s.met) met += s.weight;
  }
  return total > 0 ? met / total : 0;
}

/**
 * Find optimization opportunities in OpenAI usage data
 * Enhanced with deeper pattern analysis for competitive differentiation
 * @param rows - Aggregated OpenAI usage rows
 * @param projects - Project objects for name mapping
 * @returns Array of findings sorted by severity and savings
 */
export function findIssuesOpenAI(
  rows: OpenAIAggregatedRow[],
  projects: any[]
): Finding[] {
  // Build project name map
  const pn: Record<string, string> = {};
  (projects || []).forEach((p) => {
    pn[p.id] = p.name || p.id;
  });

  const out: Finding[] = [];

  // Calculate totals for cross-row analysis
  const totalSpend = rows.reduce(
    (sum, r) => sum + (r.cost > 0 ? r.cost : tcOpenAI(r.model, r.inp, r.out)),
    0
  );
  for (const r of rows) {
    // Use actual cost if available, otherwise calculate from tokens
    const cur = r.cost > 0 ? r.cost : tcOpenAI(r.model, r.inp, r.out);

    if (cur === 0) {
      continue;
    }

    const p = prOpenAI(r.model || r.line_item || "");

    // Calculate averages only if we have token data
    const ao = r.reqs > 0 && r.out > 0 ? Math.round(r.out / r.reqs) : 0;
    const ai = r.reqs > 0 && r.inp > 0 ? Math.round(r.inp / r.reqs) : 0;
    const ratio = r.out > 0 ? r.inp / r.out : 0;

    // If using costs API without token data, skip token-based rules
    const hasTokenData = r.inp > 0 || r.out > 0;

    const isGPT4O =
      r.model.toLowerCase().includes("gpt-4o") &&
      !r.model.toLowerCase().includes("mini");
    const isGPT4OMini = r.model.toLowerCase().includes("gpt-4o-mini");
    const isO1 =
      r.model.toLowerCase().includes("o1") &&
      !r.model.toLowerCase().includes("o3");
    const isGPT4 =
      r.model.toLowerCase().includes("gpt-4") &&
      !r.model.toLowerCase().includes("gpt-4o");

    // Track categories already added for this model to prevent duplicates
    const addedCategories = new Set<OpenAICategory>();

    // Helper function to add a finding
    const addFinding = (
      category: OpenAICategory,
      optimizedCost: number,
      reason: string,
      action: string,
      severity: Severity,
      confidence: number,
      impact?: string
    ) => {
      // Skip if this category was already added for this model
      if (addedCategories.has(category)) {
        return;
      }

      const sav = cur - optimizedCost;
      if (sav > 0.5 || category === OpenAICategory.MODEL_UPGRADE) {
        addedCategories.add(category);
        const impactText =
          impact ||
          (sav > 0 ? `${$(sav)}/mo (${P(sav, cur)}%)` : `Quality improvement`);
        const modelId = r.model || r.line_item || "unknown";
        out.push({
          id: `${modelId}-${r.project_id || "x"}-${category.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
          name: modelId,
          ws: r.project_id
            ? pn[r.project_id] || r.project_id
            : "Default project",
          model: modelId,
          ml: p.l || modelId,
          inp: r.inp,
          out: r.out,
          cached: 0, // OpenAI doesn't expose cache stats
          reqs: r.reqs,
          ao,
          ai,
          ratio,
          cr: 0, // No cache rate for OpenAI
          cur,
          opt: optimizedCost,
          sav: Math.max(sav, 0),
          reason,
          action,
          sev: severity,
          cat: category,
          conf: confidence,
          impact: impactText,
          activeDays: r.activeDays,
          temporal: {
            burstiness: 0,
            consistency: 0,
            batchCandidate: false,
            meanDaily: r.activeDays > 0 ? r.reqs / r.activeDays : 0,
          },
        });
      }
    };

    /* ─── RULE 0a: Cost-Only Analysis (when no token data) ─── */
    // When using costs API without token breakdowns, provide basic cost insights
    // Skip this rule - we'll handle service-specific rules below

    /* ─── RULE 0b: Service-Specific High-Impact Analysis ─── */
    // Only show for completions services, not audio/images/etc
    const serviceName = r.line_item || "";
    const modelName = r.model || "";
    const isAudio =
      serviceName === OpenAIService.AUDIO_TRANSCRIPTIONS ||
      serviceName === OpenAIService.AUDIO_SPEECHES ||
      modelName === "whisper-1" ||
      modelName.toLowerCase().includes("whisper");
    const isImage =
      serviceName === OpenAIService.IMAGES || modelName.includes("dall-e");
    const isEmbedding =
      serviceName === OpenAIService.EMBEDDINGS ||
      modelName.includes("embedding");

    // Skip HIGH_IMPACT for non-completions services
    const isNonCompletionsService = isAudio || isImage || isEmbedding;

    if (!isNonCompletionsService && hasTokenData && cur > 1) {
      const spendPercent = totalSpend > 0 ? cur / totalSpend : 0;
      const conf = 0.5;
      const reason = `${r.model}: $${cur.toFixed(2)}/mo across ${r.activeDays} active day${r.activeDays !== 1 ? "s" : ""}. Represents significant portion of spend.`;
      const action = `Review: (1) Model selection - test GPT-4o-mini for 95% savings, (2) Prompt optimization - target 20-30% token reduction, (3) Caching for repeated context, (4) Batch API for async workloads.`;
      // WARNING if >20% of total spend OR >$20, otherwise INFO
      const sev =
        spendPercent > 0.2 || cur > 20 ? Severity.WARNING : Severity.INFO;
      const opt = cur * 0.9; // Conservative 10% optimization potential
      addFinding(
        OpenAICategory.HIGH_IMPACT_OPPORTUNITY,
        opt,
        reason,
        action,
        sev,
        conf
      );
    }

    /* ─── RULE 0: Prompt Caching Opportunity ─── */
    // Detect patterns where prompt caching could save costs
    // Large, consistent input + many requests = prime candidate
    if (hasTokenData && ai > 2000 && r.reqs > 100 && r.inp > 5e6) {
      const signals = [
        { weight: 0.3, met: ai > 5000 }, // Large prompts
        { weight: 0.25, met: r.reqs > 500 }, // High volume
        { weight: 0.2, met: ratio > 3 }, // Input-heavy
        { weight: 0.15, met: r.activeDays > 15 }, // Sustained usage
        { weight: 0.1, met: !isGPT4OMini }, // Higher-tier model
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.45) {
        // Estimate 50% of input tokens could be cached (conservative)
        const cacheableTokens = r.inp * 0.5;
        // Cached tokens cost 50% less on input, 0 on subsequent reads
        const cacheSavings = (cacheableTokens / 1e6) * p.i * 0.5;
        const opt = cur - cacheSavings;
        const reason = `Large avg input (~${ai.toLocaleString()} tok/req) across ${r.reqs.toLocaleString()} requests. ${(r.inp / 1e6).toFixed(1)}M input tokens/mo with likely repeated system prompts or context.`;
        const action = `Implement prompt caching for system prompts, instructions, or RAG context. OpenAI caches up to ${isGPT4OMini ? "5min" : "1hr"}. Potential 40-60% input cost reduction.`;
        const impact = `~${$(cacheSavings)}/mo (${P(cacheSavings, cur)}%) if 50% cacheable`;
        const sev = conf >= 0.7 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          OpenAICategory.PROMPT_CACHING,
          opt,
          reason,
          action,
          sev,
          conf,
          impact
        );
      }
    }

    /* ─── RULE 1: Model Downgrade → GPT-4o-mini ─── */
    if (
      hasTokenData &&
      (isGPT4O || isO1 || isGPT4) &&
      ao > 0 &&
      ao < 200 &&
      r.reqs > 50
    ) {
      const signals = [
        { weight: 0.3, met: ao < 100 },
        { weight: 0.25, met: r.reqs > 500 },
        { weight: 0.2, met: ai < 3000 },
        { weight: 0.15, met: ai < 2000 },
        { weight: 0.1, met: r.activeDays > 20 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const mini = prOpenAI("gpt-4o-mini");
        const opt = (r.inp / 1e6) * mini.i + (r.out / 1e6) * mini.o;
        const reason = `Avg output ${ao} tokens across ${r.reqs.toLocaleString()} reqs (avg input ${ai.toLocaleString()} tok). Pattern suggests classification/routing tasks.`;
        const action = `Switch to GPT-4o-mini. Run A/B test on 100 requests — if quality holds, migrate. Saves ~95%.`;
        const sev = conf >= 0.65 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          OpenAICategory.MODEL_DOWNGRADE_MINI,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 2: RAG Context Bloat ─── */
    if (hasTokenData && ratio > 12 && !isGPT4OMini && r.inp > 10e6) {
      const signals = [
        { weight: 0.3, met: ratio > 20 },
        { weight: 0.25, met: ai > 8000 },
        { weight: 0.2, met: ao < 500 },
        { weight: 0.15, met: r.reqs > 100 },
        { weight: 0.1, met: true },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const reductionFactor = conf >= 0.7 ? 0.5 : 0.6;
        const opt =
          ((r.inp * reductionFactor) / 1e6) * p.i + (r.out / 1e6) * p.o;
        const reason = `Input:output ratio ${ratio.toFixed(0)}:1 (~${ai.toLocaleString()} tok/req input, ~${ao} output). ${(r.inp / 1e6).toFixed(1)}M input tokens/mo. RAG pulling too many chunks.`;
        const action = `Audit retrieval: reduce top-k, add reranking, tighten chunk size. Conservative: ${Math.round((1 - reductionFactor) * 100)}% input reduction.`;
        const sev = conf >= 0.65 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          OpenAICategory.RAG_OPTIMIZATION,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 3: GPT-4o Overkill → GPT-4o-mini ─── */
    if (hasTokenData && isGPT4O && ao >= 200 && r.inp > 5e6) {
      const signals = [
        { weight: 0.3, met: ao < 1500 },
        { weight: 0.25, met: r.reqs > 100 },
        { weight: 0.2, met: ratio < 10 },
        { weight: 0.15, met: ai < 10000 },
        { weight: 0.1, met: r.activeDays > 15 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const mini = prOpenAI("gpt-4o-mini");
        const opt = (r.inp / 1e6) * mini.i + (r.out / 1e6) * mini.o;
        const reason = `GPT-4o with avg ${ao} tok output, ${r.reqs.toLocaleString()} reqs. Moderate complexity where GPT-4o-mini performs comparably.`;
        const action = `A/B test GPT-4o-mini on 10% traffic. If quality holds, migrate. Saves ~94%.`;
        const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
        addFinding(
          OpenAICategory.MODEL_DOWNGRADE_MINI,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 4: Batch API Candidate ─── */
    // Batch API only supports /v1/chat/completions and /v1/embeddings
    // Skip audio, images, and other services
    if (!isNonCompletionsService && r.reqs > 200 && cur > 5) {
      // Simple heuristic: if low daily consistency, suggest batch
      const avgDaily = r.activeDays > 0 ? r.reqs / r.activeDays : 0;
      const bursty = avgDaily > 100 && r.activeDays < 25;

      if (bursty) {
        const signals = [
          { weight: 0.35, met: avgDaily > 200 },
          { weight: 0.25, met: r.reqs > 500 },
          { weight: 0.2, met: !isGPT4OMini },
          { weight: 0.2, met: r.activeDays < 25 },
        ];
        const conf = confidenceScore(signals);
        if (conf >= 0.4) {
          const opt = cur * 0.5; // Batch API offers 50% discount
          const reason = `Bursty traffic (~${Math.round(avgDaily)} reqs/day avg). ${r.reqs.toLocaleString()} total reqs — likely batch processing.`;
          const action = `Migrate to Batch API for 50% cost reduction. Processes within 24hrs.`;
          const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
          addFinding(
            OpenAICategory.BATCH_API_MIGRATION,
            opt,
            reason,
            action,
            sev,
            conf
          );
        }
      }
    }

    /* ─── RULE 4b: High-Volume Batch Candidate (steady traffic) ─── */
    // Rule 4 only catches bursty traffic. This catches steady high-volume workloads
    // where Batch API still saves 50% if the caller can tolerate 24hr latency.
    if (
      !isNonCompletionsService &&
      r.reqs > 1000 &&
      cur > 30 &&
      r.activeDays >= 20
    ) {
      const avgDaily = r.reqs / r.activeDays;
      const signals = [
        { weight: 0.4, met: cur > 80 },
        { weight: 0.3, met: r.reqs > 5000 },
        { weight: 0.2, met: !isGPT4OMini },
        { weight: 0.1, met: avgDaily < 2000 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const opt = cur * 0.5;
        const reason = `${r.reqs.toLocaleString()} requests/mo (~${Math.round(avgDaily)}/day, ${r.activeDays} active days). Steady high-volume pattern — Batch API gives 50% off for async workloads with 24hr turnaround.`;
        const action = `If any of these calls are latency-tolerant (evals, data processing, nightly jobs), migrate to Batch API. Zero code change required beyond switching endpoint to /v1/batches.`;
        const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
        addFinding(
          OpenAICategory.BATCH_API_MIGRATION,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 5: O1/O3 Overkill Detection ─── */
    // O-series models are expensive reasoning models - detect if they're being overused
    if (
      hasTokenData &&
      (r.model.toLowerCase().includes("o1") ||
        r.model.toLowerCase().includes("o3")) &&
      r.reqs > 50
    ) {
      const signals = [
        { weight: 0.35, met: ao < 500 }, // Short outputs suggest simple tasks
        { weight: 0.25, met: ai < 5000 }, // Short inputs suggest simple prompts
        { weight: 0.2, met: r.reqs > 200 }, // High volume
        { weight: 0.15, met: ratio < 8 }, // Not context-heavy
        { weight: 0.05, met: cur > 10 }, // Significant spend
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.5) {
        const gpt4o = prOpenAI("gpt-4o");
        const opt = (r.inp / 1e6) * gpt4o.i + (r.out / 1e6) * gpt4o.o;
        const reason = `Using ${r.model} for ${r.reqs.toLocaleString()} reqs with avg ${ao} tok output. O-series excels at complex reasoning, but pattern suggests simpler tasks.`;
        const action = `Test GPT-4o on representative sample. O-series adds 60-80% cost premium for reasoning - verify it's needed. Consider GPT-4o or 4o-mini.`;
        const sev = conf >= 0.7 ? Severity.WARNING : Severity.INFO;
        addFinding(
          OpenAICategory.REASONING_MODEL_OVERKILL,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 6: High-Cost Project Alert ─── */
    // Identify projects with disproportionately high costs
    // Skip for audio/image/embedding services - they can't be optimized the same way
    if (!isNonCompletionsService && totalSpend > 20 && cur > totalSpend * 0.3) {
      // This single pattern accounts for >30% of total spend
      const conf = 0.8;
      const reason = `This pattern represents ${P(cur, totalSpend)}% of total OpenAI spend (${$(cur)}/${$(totalSpend)}/mo). ${r.reqs.toLocaleString()} reqs, avg ${ai.toLocaleString()} in / ${ao} out tokens.`;
      const action = `High-impact optimization target. Review: (1) Model choice, (2) Prompt efficiency, (3) Request patterns. Even 10% reduction = ${$(cur * 0.1)}/mo.`;
      const sev = Severity.INFO;
      const opt = cur * 0.9; // Assume 10% optimization potential
      addFinding(
        OpenAICategory.HIGH_IMPACT_OPPORTUNITY,
        opt,
        reason,
        action,
        sev,
        conf
      );
    }

    /* ─── RULE 8: Token Efficiency - Prompt Bloat ─── */
    // Detect unnecessarily verbose prompts or inefficient formatting
    if (hasTokenData && ai > 8000 && r.reqs > 100 && cur > 3) {
      const signals = [
        { weight: 0.3, met: ai > 12000 }, // Very large inputs
        { weight: 0.25, met: ao < ai * 0.05 }, // Output is tiny compared to input
        { weight: 0.2, met: r.reqs > 500 }, // High volume amplifies waste
        { weight: 0.15, met: ratio > 15 }, // Extreme input/output ratio
        { weight: 0.1, met: true },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.5) {
        // Estimate 25% token reduction through optimization
        const optimizedInput = r.inp * 0.75;
        const opt = (optimizedInput / 1e6) * p.i + (r.out / 1e6) * p.o;
        const reason = `Avg ${ai.toLocaleString()} input tokens/req producing ${ao} output tokens. ${(r.inp / 1e6).toFixed(1)}M input tokens/mo. Suggests verbose prompts, redundant context, or inefficient formatting.`;
        const action = `Audit prompts: (1) Remove instructional bloat, (2) Use structured outputs, (3) Compress examples, (4) Trim RAG context. Target 25% reduction = ${$(cur - opt)}/mo.`;
        const sev = conf >= 0.7 ? Severity.WARNING : Severity.INFO;
        addFinding(
          OpenAICategory.PROMPT_OPTIMIZATION,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 7: GPT-4 Legacy → GPT-4o Upgrade ─── */
    // Detect old GPT-4 models that should upgrade to GPT-4o
    if (hasTokenData && isGPT4 && r.reqs > 50 && cur > 2) {
      const signals = [
        { weight: 0.3, met: r.reqs > 100 },
        { weight: 0.25, met: cur > 5 },
        { weight: 0.2, met: r.activeDays > 3 },
        { weight: 0.15, met: true }, // Always recommend upgrading from legacy GPT-4
        { weight: 0.1, met: ao < 500 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const gpt4o = prOpenAI("gpt-4o");
        const opt = (r.inp / 1e6) * gpt4o.i + (r.out / 1e6) * gpt4o.o;
        const reason = `Using legacy ${r.model} (${r.reqs.toLocaleString()} reqs, avg ${ao} tok output). GPT-4o offers better performance at similar or lower cost.`;
        const action = `Upgrade to GPT-4o (gpt-4o-2024-08-06). Drop-in replacement with better reasoning, faster speed, and lower cost. Test on staging first.`;
        const sev = Severity.INFO;
        addFinding(
          OpenAICategory.MODEL_UPGRADE,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 9: Legacy Model ─── */
    if (p.g > 0 && p.g < 4 && cur > 2) {
      // Suggest upgrading to newer models
      const newer = isO1
        ? prOpenAI("o3")
        : isGPT4
          ? prOpenAI("gpt-4o")
          : prOpenAI("gpt-4o-mini");
      const newerCost = (r.inp / 1e6) * newer.i + (r.out / 1e6) * newer.o;
      const savOrCost = cur - newerCost;
      const conf = 0.8;
      const opt = Math.min(cur, newerCost);
      const reason = `Running ${p.l} (gen ${p.g}). ${newer.l} offers better performance${savOrCost > 0 ? " at lower cost" : ""}.`;
      const action = `Update model to ${newer.l.toLowerCase().replace(/ /g, "-")}. Test on staging first.`;
      const sev = Severity.INFO;
      addFinding(OpenAICategory.MODEL_UPGRADE, opt, reason, action, sev, conf);
    }
  }

  /* ─── PROJECT ORGANIZATION ANALYSIS ─── */
  // Analyze project usage patterns after processing all rows
  const projectSpend: Record<string, number> = {};

  for (const r of rows) {
    const cur = r.cost > 0 ? r.cost : tcOpenAI(r.model, r.inp, r.out);
    const pid = r.project_id || "default";
    projectSpend[pid] = (projectSpend[pid] || 0) + cur;
  }

  const projectCount = projects?.length || 0;
  const projectsWithTraffic = Object.keys(projectSpend).filter(
    (pid) => projectSpend[pid] > 0.5
  );
  const defaultProjectSpend = projectSpend["default"] || 0;

  // CASE 1: Only default project exists (no custom projects created)
  if (projectCount === 0 && totalSpend > 5) {
    const conf = 1.0;
    const reason = `All ${$(totalSpend)}/mo usage is in the default project. No custom projects configured for tracking spend by team, application, or environment.`;
    const action = `Create projects to segment usage: (1) By team (engineering, product, support), (2) By application (production app, staging, dev tools), or (3) By use case. Enables granular cost tracking and rate limits.`;
    out.push({
      id: `project-organization-none`,
      name: "Default Project",
      ws: "Default project",
      model: "N/A",
      ml: "Project Organization",
      inp: 0,
      out: 0,
      cached: 0,
      reqs: 0,
      ao: 0,
      ai: 0,
      ratio: 0,
      cr: 0,
      cur: totalSpend,
      opt: totalSpend,
      sav: 0,
      reason,
      action,
      sev: Severity.INFO,
      cat: OpenAICategory.PROJECT_ORGANIZATION,
      conf,
      impact: "Better cost visibility and rate limit control",
      activeDays: 0,
      temporal: {
        burstiness: 0,
        consistency: 0,
        batchCandidate: false,
        meanDaily: 0,
      },
    });
  }

  // CASE 2: Multiple projects exist, but only default has traffic
  if (
    projectCount > 0 &&
    defaultProjectSpend > 1 &&
    projectsWithTraffic.length === 1 &&
    projectsWithTraffic[0] === "default"
  ) {
    const conf = 1.0;
    const reason = `${projectCount} project${projectCount !== 1 ? "s" : ""} configured, but all ${$(defaultProjectSpend)}/mo usage remains in default project. Custom projects are unused.`;
    const action = `Route API traffic to appropriate projects: (1) Use project-scoped API keys, (2) Assign service accounts to projects, (3) Update API key selection in code. Projects enable cost tracking and independent rate limits.`;
    out.push({
      id: `project-organization-unused`,
      name: "Default Project",
      ws: "Default project",
      model: "N/A",
      ml: "Project Organization",
      inp: 0,
      out: 0,
      cached: 0,
      reqs: 0,
      ao: 0,
      ai: 0,
      ratio: 0,
      cr: 0,
      cur: defaultProjectSpend,
      opt: defaultProjectSpend,
      sav: 0,
      reason,
      action,
      sev: Severity.INFO,
      cat: OpenAICategory.PROJECT_ORGANIZATION,
      conf,
      impact:
        "Activate project segmentation for cost attribution and rate limits",
      activeDays: 0,
      temporal: {
        burstiness: 0,
        consistency: 0,
        batchCandidate: false,
        meanDaily: 0,
      },
    });
  }

  return out.sort((a, b) => {
    const sv: Record<Severity, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.WARNING]: 1,
      [Severity.INFO]: 2,
      [Severity.OK]: 3,
    };
    if (sv[a.sev] !== sv[b.sev]) return sv[a.sev] - sv[b.sev];
    return b.sav - a.sav;
  });
}
