import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSystemPrompt,
  findIssuesLLM,
  mergeConsensus,
  priceLlmFindings,
  resolveCategory,
  validCategories,
  type AnalysisContext,
  type LlmProposal,
  type UsageSummary,
} from "@/lib/nim/analysis";
import { costEnableCaching, costHaikuDowngrade } from "@/lib/anthropic/costing";
import { AnthropicCategory, Severity } from "@/types/analysis";
import type { Finding } from "@/types";

const row: UsageSummary = {
  id: "key1-ws1",
  name: "key1",
  ws: "production",
  model: "claude-opus-4-6",
  ml: "Opus 4.6",
  inp: 10_000_000,
  out: 100_000,
  cached: 0,
  cacheCreated: 0,
  reqs: 1000,
  activeDays: 25,
  cur: 200,
};

const ctx: AnalysisContext = {
  vendor: "anthropic",
  totalSpend: 200,
  workspaceCount: 1,
};

const proposal = (over: Partial<LlmProposal> = {}): LlmProposal => ({
  rowId: "key1-ws1",
  category: AnthropicCategory.PROMPT_CACHING,
  severity: "warning",
  confidence: 0.7,
  reason: "r",
  action: "a",
  ...over,
});

describe("priceLlmFindings", () => {
  it("prices proposals deterministically from the costing module", () => {
    const [f] = priceLlmFindings(
      [
        proposal({
          category: "Model Downgrade → Haiku",
          severity: "critical",
          confidence: 0.9,
        }),
      ],
      [row],
      ctx
    );
    const expectedOpt = costHaikuDowngrade({
      model: row.model,
      inp: row.inp,
      out: row.out,
      cached: 0,
      cacheCreated: 0,
      cur: row.cur,
      conf: 0.9,
    });
    expect(f.opt).toBeCloseTo(expectedOpt, 10);
    expect(f.sav).toBeCloseTo(row.cur - expectedOpt, 10);
    expect(f.sev).toBe(Severity.CRITICAL);
    expect(f.model).toBe("claude-opus-4-6");
    expect(f.source).toBe("llm");
    expect(f.cat).toBe(AnthropicCategory.MODEL_DOWNGRADE_HAIKU);
  });

  it("prices a caching proposal with the enable-caching formula", () => {
    const [f] = priceLlmFindings([proposal()], [row], ctx);
    expect(f.opt).toBeCloseTo(
      costEnableCaching({
        model: row.model,
        inp: row.inp,
        out: row.out,
        cached: 0,
        cacheCreated: 0,
        cur: row.cur,
        conf: 0.7,
      }),
      10
    );
  });

  it("drops proposals whose category is outside the fixed enum", () => {
    const out = priceLlmFindings(
      [proposal({ category: "Made Up Category" })],
      [row],
      ctx
    );
    expect(out).toHaveLength(0);
  });

  it("drops uncostable cost categories but keeps org categories at $0", () => {
    const out = priceLlmFindings(
      [
        // RAG on a row with no matching id → no metrics → uncostable → dropped
        proposal({ rowId: "missing", category: "RAG Optimization" }),
        // Org-structure finding survives with zero savings
        proposal({
          rowId: "org",
          category: "Workspace Organization",
          severity: "info",
        }),
      ],
      [row],
      ctx
    );
    expect(out).toHaveLength(1);
    expect(out[0].cat).toBe(AnthropicCategory.WORKSPACE_ORGANIZATION);
    expect(out[0].sav).toBe(0);
    expect(out[0].cur).toBe(200); // falls back to totalSpend
    expect(out[0].name).toBe("Organization");
    expect(out[0].impact).toBe("Quality improvement");
  });

  it("clamps confidence to [0,1]", () => {
    const [f] = priceLlmFindings([proposal({ confidence: 5 })], [row], ctx);
    expect(f.conf).toBe(1);
  });

  it("drops a 'downgrade' whose target is not cheaper than the row's model", () => {
    const haikuRow: UsageSummary = {
      ...row,
      id: "key2-ws1",
      model: "claude-haiku-3",
      ml: "Haiku 3",
      cur: 5,
    };
    const out = priceLlmFindings(
      [
        proposal({ rowId: "key2-ws1", category: "Model Downgrade → Sonnet" }),
        proposal({ rowId: "key2-ws1", category: "Model Downgrade → Haiku" }),
      ],
      [haikuRow],
      ctx
    );
    expect(out).toHaveLength(0);
  });

  it("keeps only the single best downgrade per row", () => {
    const out = priceLlmFindings(
      [
        proposal({ category: "Model Downgrade → Sonnet" }),
        proposal({ category: "Model Downgrade → Haiku" }),
      ],
      [row],
      ctx
    );
    // Haiku repricing saves more than Sonnet repricing on an Opus row.
    expect(out).toHaveLength(1);
    expect(out[0].cat).toBe(AnthropicCategory.MODEL_DOWNGRADE_HAIKU);
  });

  it("dedupes repeated (row, category) proposals", () => {
    const out = priceLlmFindings([proposal(), proposal()], [row], ctx);
    expect(out).toHaveLength(1);
  });

  it("drops proposals without a reason and sorts by severity then savings", () => {
    const out = priceLlmFindings(
      [
        proposal({ category: "Batch API Migration", severity: "info" }),
        proposal({ reason: "", severity: "critical" }),
        proposal({ category: "Prompt Caching", severity: "critical" }),
      ],
      [row],
      ctx
    );
    expect(out).toHaveLength(2); // empty-reason dropped
    expect(out[0].sev).toBe(Severity.CRITICAL);
    expect(out[1].sev).toBe(Severity.INFO);
  });
});

describe("resolveCategory", () => {
  it("canonicalizes arrow and case drift", () => {
    expect(resolveCategory("anthropic", "model downgrade -> haiku")).toBe(
      AnthropicCategory.MODEL_DOWNGRADE_HAIKU
    );
    expect(resolveCategory("anthropic", "Prompt Caching")).toBe(
      AnthropicCategory.PROMPT_CACHING
    );
    expect(resolveCategory("anthropic", "nonsense")).toBeNull();
  });
});

/* ─── Consensus merge ─── */

const mkRuleFinding = (over: Partial<Finding> = {}): Finding => ({
  id: "key1-ws1-prompt-caching",
  name: "key1",
  ws: "production",
  model: "claude-opus-4-6",
  ml: "Opus 4.6",
  inp: 10_000_000,
  out: 100_000,
  cached: 0,
  reqs: 1000,
  ao: 100,
  ai: 10_000,
  ratio: 100,
  cr: 0,
  cur: 200,
  opt: 120,
  sav: 80,
  reason: "rule reason",
  action: "rule action",
  sev: Severity.WARNING,
  cat: AnthropicCategory.PROMPT_CACHING,
  conf: 0.8,
  impact: "$80.00/mo (40%)",
  activeDays: 25,
  temporal: {
    burstiness: 0.2,
    consistency: 0.8,
    batchCandidate: false,
    meanDaily: 300,
  },
  source: "rules",
  ...over,
});

describe("mergeConsensus", () => {
  it("merges findings found by both engines, keeping the rule's text and price", () => {
    const ruleF = mkRuleFinding({ conf: 0.7 });
    const [llmF] = priceLlmFindings(
      [proposal({ confidence: 0.6, reason: "llm reason" })],
      [row],
      ctx
    );
    const merged = mergeConsensus([ruleF], [llmF]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("both");
    expect(merged[0].reason).toBe("rule reason");
    expect(merged[0].action).toBe("rule action");
    expect(merged[0].sav).toBe(80); // rule's deterministic price kept
    expect(merged[0].conf).toBeCloseTo(0.8); // max(0.7, 0.6) + 0.1
  });

  it("caps the consensus confidence boost at 0.95", () => {
    const ruleF = mkRuleFinding({ conf: 0.92 });
    const [llmF] = priceLlmFindings(
      [proposal({ confidence: 0.9 })],
      [row],
      ctx
    );
    const merged = mergeConsensus([ruleF], [llmF]);
    expect(merged[0].conf).toBe(0.95);
  });

  it("keeps rules-only findings unchanged with source 'rules'", () => {
    const ruleF = mkRuleFinding();
    const merged = mergeConsensus([ruleF], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("rules");
    expect(merged[0].conf).toBe(0.8);
    expect(merged[0].sav).toBe(80);
  });

  it("keeps LLM-only findings with their deterministic price and source 'llm'", () => {
    const ruleF = mkRuleFinding(); // prompt caching from rules
    const [llmF] = priceLlmFindings(
      [proposal({ category: "Batch API Migration", reason: "bursty" })],
      [row],
      ctx
    );
    const merged = mergeConsensus([ruleF], [llmF]);
    expect(merged).toHaveLength(2);
    const llmOnly = merged.find((f) => f.source === "llm");
    expect(llmOnly).toBeDefined();
    expect(llmOnly!.cat).toBe(AnthropicCategory.BATCH_API_MIGRATION);
    expect(llmOnly!.sav).toBeCloseTo(100, 10); // 50% of $200, priced by code
    expect(llmOnly!.reason).toBe("bursty");
  });

  it("merges org-structure findings from both engines despite different id shapes", () => {
    const ruleOrg = mkRuleFinding({
      id: "workspace-organization-unused",
      cat: AnthropicCategory.WORKSPACE_ORGANIZATION,
      sev: Severity.INFO,
      sav: 0,
      conf: 1.0,
    });
    const [llmOrg] = priceLlmFindings(
      [
        proposal({
          rowId: "org",
          category: "Workspace Organization",
          severity: "info",
        }),
      ],
      [row],
      ctx
    );
    const merged = mergeConsensus([ruleOrg], [llmOrg]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("both");
  });
});

/* ─── LLM contract: the model never sees or emits a savings field ─── */

describe("LLM payload schema", () => {
  it("the system prompt contains no savings field and lists valid categories", () => {
    for (const vendor of ["anthropic", "openai"] as const) {
      const prompt = buildSystemPrompt(vendor);
      expect(prompt).not.toContain("savingsMonthly");
      expect(prompt).not.toMatch(/"savings/i);
      for (const c of validCategories(vendor)) {
        expect(prompt).toContain(`"${c}"`);
      }
    }
    expect(buildSystemPrompt("anthropic")).toContain("claude-haiku-4-5");
    expect(buildSystemPrompt("openai")).toContain("gpt-4o-mini");
    expect(buildSystemPrompt("anthropic")).toContain("RAG CONTEXT BLOAT");
  });

  it("the request payload sent to NIM contains no savings field", async () => {
    let captured = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        captured = String(init.body);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"findings": []}' } }],
          }),
          { status: 200 }
        );
      })
    );
    await findIssuesLLM([row], ctx);
    expect(captured).not.toBe("");
    expect(captured).not.toContain("savingsMonthly");
    expect(captured.toLowerCase()).not.toContain('"savings');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
