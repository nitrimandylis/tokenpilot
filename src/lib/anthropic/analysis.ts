/* ═══════════════════ ANALYSIS ENGINE ═══════════════════ */

import type {
  AggregatedRow,
  Finding,
  TemporalPattern,
  Workspace,
  UsageBucket,
} from "@/types";
import {
  AnthropicCategory,
  AnthropicModelTier,
  Severity,
} from "@/types/analysis";
import { pr, tc } from "./pricing";
import { $, P } from "@/lib/formatters";

/* ═══════════════════ AGGREGATION ═══════════════════ */

/**
 * Aggregates usage buckets by model, API key, and workspace
 * Consolidates token counts and request metrics across time periods
 *
 * @param buckets - Array of usage buckets from the API
 * @returns Array of aggregated rows with summed metrics
 */
export function agg(buckets: UsageBucket[]): AggregatedRow[] {
  const m: Record<string, AggregatedRow & { days: Set<string> }> = {};

  for (const b of buckets) {
    const k = `${b.model || "?"}|${b.api_key_id || "all"}|${b.workspace_id || "all"}`;

    if (!m[k]) {
      m[k] = {
        model: b.model!,
        kid: b.api_key_id,
        wid: b.workspace_id,
        inp: 0,
        out: 0,
        cached: 0,
        reqs: 0,
        days: new Set(),
        activeDays: 0,
      };
    }

    m[k].inp +=
      (b.input_tokens || 0) +
      (b.uncached_input_tokens || 0) +
      (b.input_tokens_uncached || 0);
    m[k].out += b.output_tokens || 0;
    m[k].cached +=
      (b.cache_read_input_tokens || 0) + (b.input_tokens_cached || 0);
    m[k].reqs += b.request_count || 0;

    if (b.bucket_start) {
      m[k].days.add(b.bucket_start.split("T")[0]);
    }
  }

  return Object.values(m).map((r) => ({
    ...r,
    activeDays: r.days.size,
    days: undefined,
  })) as AggregatedRow[];
}

/* ═══════════════════ TEMPORAL ANALYSIS ═══════════════════ */

/**
 * Analyzes temporal patterns in usage data to identify bursty traffic
 * Calculates burstiness coefficient (CoV) and batch API candidacy
 *
 * @param buckets - Array of usage buckets
 * @param kid - Optional API key ID to filter by
 * @param model - Optional model name to filter by
 * @returns Temporal pattern metrics including burstiness and batch candidacy
 */
export function analyzeTemporalPattern(
  buckets: UsageBucket[],
  kid?: string,
  model?: string
): TemporalPattern {
  const daily: Record<string, { reqs: number }> = {};

  for (const b of buckets) {
    if (kid && b.api_key_id !== kid) continue;
    if (model && b.model !== model) continue;

    const day = b.bucket_start?.split("T")[0];
    if (!day) continue;

    if (!daily[day]) daily[day] = { reqs: 0 };
    daily[day].reqs += b.request_count || 0;
  }

  const vals = Object.values(daily).map((d) => d.reqs);

  if (vals.length < 3) {
    return {
      burstiness: 0,
      consistency: 0,
      batchCandidate: false,
      meanDaily: 0,
    };
  }

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  const zeroDays = vals.filter((v) => v === 0).length;
  const batchCandidate =
    (cv > 1.2 && mean > 20) || (zeroDays > vals.length * 0.3 && mean > 50);

  return {
    burstiness: cv,
    consistency: 1 - cv,
    batchCandidate,
    meanDaily: mean,
  };
}

/* ═══════════════════ CONFIDENCE SCORING ═══════════════════ */

/**
 * Multi-signal confidence scoring system
 * Calculates weighted confidence score based on detection signals
 *
 * @param signals - Array of signals with weights and met status
 * @returns Confidence score between 0 and 1
 */
export function confidenceScore(
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

/* ═══════════════════ ANALYSIS ENGINE v2 ═══════════════════ */

/**
 * Main detection engine with 6 optimization rules
 * Analyzes aggregated usage data to identify cost optimization opportunities
 *
 * Rules:
 * 1. Model Downgrade → Haiku (low output tokens)
 * 2. RAG Context Bloat (high input:output ratio)
 * 3. Prompt Caching Miss (low cache rate with high volume)
 * 4. Opus Overkill → Sonnet (moderate complexity)
 * 5. Batch API Candidate (bursty traffic patterns)
 * 6. Legacy Model (outdated model generation)
 *
 * @param rows - Aggregated usage rows
 * @param workspaces - Array of workspace objects for name mapping
 * @param rawBuckets - Raw usage buckets for temporal analysis
 * @returns Array of findings sorted by severity and savings
 */
export function findIssues(
  rows: AggregatedRow[],
  workspaces: Workspace[],
  rawBuckets: UsageBucket[]
): Finding[] {
  // Build workspace name map
  const wn: Record<string, string> = {};
  (workspaces || []).forEach((w) => {
    wn[w.id] = w.display_name || w.name || w.id;
  });

  const out: Finding[] = [];

  // Track categories per API key to prevent duplicates (e.g., same RAG issue across multiple models)
  const addedCategoriesByKey: Record<string, Set<AnthropicCategory>> = {};

  for (const r of rows) {
    if (r.inp === 0 && r.out === 0) continue;

    const p = pr(r.model);
    const cur = tc(r.model, r.inp, r.out);

    if (cur < 0.5) continue;

    const ao = r.reqs > 0 ? Math.round(r.out / r.reqs) : 0;
    const ai = r.reqs > 0 ? Math.round(r.inp / r.reqs) : 0;
    const ratio = r.out > 0 ? r.inp / r.out : 0;
    const cr = r.inp + r.cached > 0 ? r.cached / (r.inp + r.cached) : 0;
    const isO = p.t === AnthropicModelTier.OPUS;
    const isS = p.t === AnthropicModelTier.SONNET;
    const isH = p.t === AnthropicModelTier.HAIKU;
    const temporal = analyzeTemporalPattern(rawBuckets || [], r.kid, r.model);
    const inputVariance = ai > 5000 ? "high" : ai > 1000 ? "medium" : "low";

    // Initialize set for this API key if not exists
    const keyId = r.kid || r.model;
    if (!addedCategoriesByKey[keyId]) {
      addedCategoriesByKey[keyId] = new Set();
    }

    // Helper function to add a finding
    const addFinding = (
      category: AnthropicCategory,
      optimizedCost: number,
      reason: string,
      action: string,
      severity: Finding["sev"],
      confidence: number
    ) => {
      // Skip if this category was already added for this API key
      if (addedCategoriesByKey[keyId].has(category)) {
        console.log(
          `[Anthropic Analysis] Skipping duplicate category ${category} for ${keyId}`
        );
        return;
      }

      const sav = cur - optimizedCost;
      if (sav > 0.5 || category === AnthropicCategory.MODEL_UPGRADE) {
        addedCategoriesByKey[keyId].add(category);
        const impact =
          sav > 0 ? `${$(sav)}/mo (${P(sav, cur)}%)` : `Quality improvement`;
        out.push({
          id: `${r.kid || r.model}-${r.wid || "x"}-${category.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
          name: r.kid || r.model,
          ws: r.wid ? wn[r.wid] || r.wid : "Default workspace",
          model: r.model,
          ml: p.l,
          inp: r.inp,
          out: r.out,
          cached: r.cached,
          reqs: r.reqs,
          ao,
          ai,
          ratio,
          cr,
          cur,
          opt: optimizedCost,
          sav: Math.max(sav, 0),
          reason,
          action,
          sev: severity,
          cat: category,
          conf: confidence,
          impact,
          activeDays: r.activeDays,
          temporal,
        });
      }
    };

    /* ─── RULE 1: Model Downgrade → Haiku ─── */
    if ((isO || isS) && ao > 0 && ao < 150 && r.reqs > 50) {
      const signals = [
        { weight: 0.3, met: ao < 80 },
        { weight: 0.25, met: r.reqs > 500 },
        { weight: 0.2, met: inputVariance !== "high" },
        { weight: 0.15, met: ai < 2000 },
        { weight: 0.1, met: r.activeDays > 20 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const h = pr("haiku-4-5");
        const opt = (r.inp / 1e6) * h.i + (r.out / 1e6) * h.o;
        const reason = `Avg output ${ao} tokens across ${r.reqs.toLocaleString()} reqs (avg input ${ai.toLocaleString()} tok). Pattern consistent with classification, routing, or extraction.`;
        const action = `Switch to claude-haiku-4-5. Run a 100-request A/B test first — if accuracy delta <2%, ship it.`;
        const sev = conf >= 0.65 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          AnthropicCategory.MODEL_DOWNGRADE_HAIKU,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 2: RAG Context Bloat ─── */
    if (ratio > 12 && !isH && r.inp > 10e6) {
      const signals = [
        { weight: 0.3, met: ratio > 20 },
        { weight: 0.25, met: ai > 8000 },
        { weight: 0.2, met: ao < 500 },
        { weight: 0.15, met: r.reqs > 100 },
        { weight: 0.1, met: cr < 0.1 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const reductionFactor = conf >= 0.7 ? 0.5 : 0.6;
        const targetP = isO ? pr("sonnet-4-6") : p;
        const opt =
          ((r.inp * reductionFactor) / 1e6) * targetP.i +
          (r.out / 1e6) * targetP.o;
        const reason = `Input:output ratio ${ratio.toFixed(0)}:1 (~${ai.toLocaleString()} tok/req input, ~${ao} output). ${(r.inp / 1e6).toFixed(1)}M input tokens/mo. Retrieval pulling too many chunks.`;
        const action = `Audit retrieval pipeline: reduce top-k, add reranking, tighten chunk size. ${isO ? "Downgrade to Sonnet — RAG quality is retrieval-bound, not model-bound." : ""} Conservative: ${Math.round((1 - reductionFactor) * 100)}% input reduction.`;
        const sev = conf >= 0.65 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          AnthropicCategory.RAG_OPTIMIZATION,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 3: Prompt Caching Miss ─── */
    if (cr < 0.05 && r.inp > 20e6 && !isH) {
      const signals = [
        { weight: 0.35, met: cr < 0.01 },
        { weight: 0.25, met: r.reqs > 200 },
        { weight: 0.2, met: ai > 3000 },
        { weight: 0.2, met: r.activeDays > 15 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const cacheable = r.inp * 0.6;
        const opt =
          ((r.inp - cacheable) / 1e6) * p.i +
          (cacheable / 1e6) * p.i * 0.1 +
          (r.out / 1e6) * p.o;
        const reason = `${(r.inp / 1e6).toFixed(1)}M input at ${(cr * 100).toFixed(1)}% cache rate. ${cr < 0.01 ? "Caching appears disabled." : "Minimal caching."} System prompts re-sent every request without caching.`;
        const action = `Enable prompt caching on static prefixes (system prompt, tool defs, persistent context). Add cache_control breakpoints in message array. ~90% savings on cached portion.`;
        const sev = conf >= 0.65 ? Severity.CRITICAL : Severity.WARNING;
        addFinding(
          AnthropicCategory.PROMPT_CACHING,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 4: Opus Overkill → Sonnet ─── */
    if (isO && ao >= 150 && r.inp > 5e6) {
      const signals = [
        { weight: 0.3, met: ao < 1500 },
        { weight: 0.25, met: r.reqs > 100 },
        { weight: 0.2, met: ratio < 10 },
        { weight: 0.15, met: ai < 10000 },
        { weight: 0.1, met: r.activeDays > 15 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const s = pr("sonnet-4-6");
        const opt = (r.inp / 1e6) * s.i + (r.out / 1e6) * s.o;
        const reason = `${p.l} with avg ${ao} tok output, ${r.reqs.toLocaleString()} reqs. Moderate complexity where Sonnet performs within 5% of Opus.`;
        const action = `A/B test Sonnet 4.6 on 10% traffic split. If quality holds, migrate fully. Opus→Sonnet saves ~80%.`;
        const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
        addFinding(
          AnthropicCategory.MODEL_DOWNGRADE_SONNET,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 5: Batch API Candidate ─── */
    if (temporal.batchCandidate && r.reqs > 200 && cur > 5) {
      const signals = [
        { weight: 0.35, met: temporal.burstiness > 1.5 },
        { weight: 0.25, met: r.reqs > 500 },
        { weight: 0.2, met: !isH },
        { weight: 0.2, met: r.activeDays < 25 },
      ];
      const conf = confidenceScore(signals);
      if (conf >= 0.4) {
        const opt = cur * 0.5;
        const reason = `Bursty traffic (CoV: ${temporal.burstiness.toFixed(1)}, ~${Math.round(temporal.meanDaily)} reqs/day avg). ${r.reqs.toLocaleString()} total reqs with periodic spikes — batch processing or eval runs.`;
        const action = `Migrate to Batch API for 50% cost reduction. Processes within 24hrs. If not latency-sensitive, this is free money.`;
        const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
        addFinding(
          AnthropicCategory.BATCH_API_MIGRATION,
          opt,
          reason,
          action,
          sev,
          conf
        );
      }
    }

    /* ─── RULE 6: Legacy Model ─── */
    if (p.g > 0 && p.g < 3 && cur > 2) {
      const newer =
        p.t === AnthropicModelTier.OPUS
          ? pr("opus-4-6")
          : p.t === AnthropicModelTier.SONNET
            ? pr("sonnet-4-6")
            : pr("haiku-4-5");
      const newerCost = (r.inp / 1e6) * newer.i + (r.out / 1e6) * newer.o;
      const savOrCost = cur - newerCost;
      const conf = 0.8;
      const opt = Math.min(cur, newerCost);
      const reason = `Running ${p.l} (gen ${p.g}). ${newer.l} offers better performance${savOrCost > 0 ? " at lower cost" : ""}.`;
      const action = `Update model string to ${newer.l.toLowerCase().replace(/ /g, "-")}. Drop-in replacement — test on staging, then ship.`;
      const sev = Severity.INFO;
      addFinding(
        AnthropicCategory.MODEL_UPGRADE,
        opt,
        reason,
        action,
        sev,
        conf
      );
    }
  }

  /* ─── WORKSPACE ORGANIZATION ANALYSIS ─── */
  // Analyze workspace usage patterns after processing all rows
  const workspaceSpend: Record<string, number> = {};
  let totalSpend = 0;

  for (const r of rows) {
    const cur = tc(r.model, r.inp, r.out);
    totalSpend += cur;
    const wid = r.wid || "default";
    workspaceSpend[wid] = (workspaceSpend[wid] || 0) + cur;
  }

  const workspaceCount = workspaces.length;
  const workspacesWithTraffic = Object.keys(workspaceSpend).filter(
    (wid) => workspaceSpend[wid] > 0.5
  );
  const defaultWorkspaceSpend = workspaceSpend["default"] || 0;

  // CASE 1: Only default workspace exists (no custom workspaces created)
  if (workspaceCount === 0 && totalSpend > 5) {
    const conf = 1.0;
    const reason = `All ${$(totalSpend)}/mo of API usage is consolidated in the default workspace. You haven't created any custom workspaces yet, which means you're viewing all API costs as a single undifferentiated number. For organizations with multiple teams, products, or environments, this makes it impossible to answer critical questions: Which team is driving the most spend? How much does production cost vs. staging? Is the customer support chatbot more expensive than the main product? Without workspace segmentation, cost attribution is a black box.`;
    const action = `Set up custom workspaces to unlock granular cost tracking:

**Step 1: Plan Your Workspace Structure**
Choose a segmentation strategy that aligns with how your organization operates:

- **By Environment** (most common for engineering teams):
  → production, staging, development
  → Benefit: Isolate prod costs, prevent dev/test spend from skewing production metrics

- **By Team**:
  → engineering, product, customer-support, data-science
  → Benefit: Cross-charge costs to the right budget owners

- **By Product/Service**:
  → core-app, chatbot, content-generation, internal-tools
  → Benefit: Track P&L per product line

- **By Customer** (for SaaS/enterprise):
  → customer-a, customer-b, free-tier, paid-tier
  → Benefit: Cost-per-customer analysis, identify unprofitable accounts

**Step 2: Create Workspaces in Console**
1. Go to Anthropic Console → Organization Settings → Workspaces
2. Click "Create Workspace"
3. Name it clearly (e.g., "production", "staging", "team-eng")
4. Repeat for each workspace in your structure
5. Document which apps/teams should use each workspace

**Step 3: Route Traffic to Workspaces**
Create workspace-scoped API keys for each workspace:
1. In Console, navigate to the workspace (e.g., "production")
2. Go to API Keys → Create Key
3. Name it descriptively (e.g., "prod-app-backend-key")
4. Copy the key and update your application's environment variables
5. Repeat for each workspace

**Step 4: Verify & Monitor**
- Wait 24-48 hours for usage data to populate
- Return to Console → Workspaces to see spend breakdown
- Check that traffic is routing to the correct workspace
- Adjust key assignments if needed

**Pro Tips:**
- Start simple: Begin with 2-3 workspaces (e.g., prod/staging/dev), expand later
- Use environment variables to inject the correct API key per deployment
- Set workspace-level rate limits to prevent runaway costs in any single workspace
- Export monthly reports filtered by workspace for finance/accounting

**Example: Small Startup Setup**
- production → All user-facing API calls
- staging → CI/CD test runs, QA environment
- development → Local dev, experiments, prototyping

After setup, you'll be able to see: "Production: $450/mo, Staging: $120/mo, Dev: $55/mo" instead of a single "$625/mo" number.`;
    out.push({
      id: `workspace-organization-none`,
      name: "Default Workspace",
      ws: "Default workspace",
      model: "N/A",
      ml: "Workspace Organization",
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
      cat: AnthropicCategory.WORKSPACE_ORGANIZATION,
      conf,
      impact: "Better cost visibility and attribution",
      activeDays: 0,
      temporal: {
        burstiness: 0,
        consistency: 0,
        batchCandidate: false,
        meanDaily: 0,
      },
    });
  }

  // CASE 2: Multiple workspaces exist, but only default has traffic
  if (
    workspaceCount > 0 &&
    defaultWorkspaceSpend > 1 &&
    workspacesWithTraffic.length === 1 &&
    workspacesWithTraffic[0] === "default"
  ) {
    const conf = 1.0;
    const reason = `You've created ${workspaceCount} custom workspace${workspaceCount !== 1 ? "s" : ""}, but all ${$(defaultWorkspaceSpend)}/mo of API usage is still flowing through the default workspace. This means you're missing out on the core benefit of workspaces: granular cost tracking and attribution across teams, projects, or environments. Without active workspace routing, you can't answer questions like "How much does our production app cost vs. staging?" or "Which team is driving the most API spend?" Your workspace setup exists but isn't being utilized.`;
    const action = `To activate workspace-based cost tracking, you need to route API traffic to the appropriate workspaces. Here's how:

**Option 1: Workspace-Scoped API Keys (Recommended)**
1. Go to Anthropic Console → Settings → API Keys
2. For each workspace, create dedicated API keys:
   - Production workspace → Create key "prod-api-key"
   - Staging workspace → Create key "staging-api-key"
   - Dev workspace → Create key "dev-api-key"
3. Update your applications to use the correct workspace-scoped key:
   - Production app uses prod-api-key
   - Staging/CI uses staging-api-key
   - Local development uses dev-api-key
4. Verify: Check Console → Workspaces to confirm traffic is routing correctly

**Option 2: Programmatic Workspace Assignment**
If you can't change API keys (e.g., shared key for all environments):
1. Include workspace_id in your API request headers or parameters
2. Anthropic will route the request to the specified workspace
3. Example: Add metadata or tags that map to workspace IDs

**Common Workspace Patterns:**
- **By Environment**: production, staging, development (isolate prod costs)
- **By Team**: engineering, product, customer-support (cross-charge costs)
- **By Product**: app-a, app-b, internal-tools (multi-product orgs)
- **By Customer**: enterprise-client-1, enterprise-client-2 (SaaS with dedicated instances)

**Why This Matters:**
- Granular cost visibility enables budget tracking per team/project
- Identify which workspaces are growing fastest
- Set workspace-level rate limits for cost control
- Export usage reports filtered by workspace for finance/accounting

**Verification:**
After routing, return to this view next month — you should see spend distributed across your workspaces instead of 100% in default.`;
    out.push({
      id: `workspace-organization-unused`,
      name: "Default Workspace",
      ws: "Default workspace",
      model: "N/A",
      ml: "Workspace Organization",
      inp: 0,
      out: 0,
      cached: 0,
      reqs: 0,
      ao: 0,
      ai: 0,
      ratio: 0,
      cr: 0,
      cur: defaultWorkspaceSpend,
      opt: defaultWorkspaceSpend,
      sav: 0,
      reason,
      action,
      sev: Severity.INFO,
      cat: AnthropicCategory.WORKSPACE_ORGANIZATION,
      conf,
      impact: "Activate workspace segmentation for cost attribution",
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
    const sv: Record<Finding["sev"], number> = {
      [Severity.CRITICAL]: 0,
      [Severity.WARNING]: 1,
      [Severity.INFO]: 2,
      [Severity.OK]: 3,
    };
    if (sv[a.sev] !== sv[b.sev]) return sv[a.sev] - sv[b.sev];
    return b.sav - a.sav;
  });
}
