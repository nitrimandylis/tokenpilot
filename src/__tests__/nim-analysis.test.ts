import { describe, it, expect } from "vitest";
import {
  mergeLlmFindings,
  buildSystemPrompt,
  type UsageSummary,
  type AnalysisContext,
} from "@/lib/nim/analysis";
import { Severity } from "@/types/analysis";

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

describe("mergeLlmFindings", () => {
  it("clamps savings to [0, currentCost] and grounds dollar figures", () => {
    const [f] = mergeLlmFindings(
      [
        {
          rowId: "key1-ws1",
          category: "Model Downgrade → Haiku",
          severity: "critical",
          confidence: 0.9,
          savingsMonthly: 9999, // absurd; must clamp to cur
          reason: "low output",
          action: "switch model",
        },
      ],
      [row],
      ctx
    );
    expect(f.sav).toBe(200);
    expect(f.opt).toBe(0);
    expect(f.cur).toBe(200);
    expect(f.sev).toBe(Severity.CRITICAL);
    expect(f.model).toBe("claude-opus-4-6");
  });

  it("clamps negative savings to 0 and confidence to [0,1]", () => {
    const [f] = mergeLlmFindings(
      [
        {
          rowId: "key1-ws1",
          category: "Model Upgrade", // quality category survives zero savings
          severity: "info",
          confidence: 5,
          savingsMonthly: -50,
          reason: "r",
          action: "a",
        },
      ],
      [row],
      ctx
    );
    expect(f.sav).toBe(0);
    expect(f.conf).toBe(1);
    expect(f.impact).toBe("Quality improvement");
  });

  it("handles org-level findings with no matching row", () => {
    const [f] = mergeLlmFindings(
      [
        {
          rowId: "org",
          category: "Workspace Organization",
          severity: "info",
          confidence: 0.8,
          savingsMonthly: 0,
          reason: "all spend in default",
          action: "split workspaces",
        },
      ],
      [row],
      ctx
    );
    expect(f.cur).toBe(200); // falls back to totalSpend
    expect(f.name).toBe("Organization");
  });

  it("drops findings without a reason and sorts by severity then savings", () => {
    const out = mergeLlmFindings(
      [
        {
          rowId: "key1-ws1",
          category: "A",
          severity: "info",
          confidence: 0.5,
          savingsMonthly: 10,
          reason: "r",
          action: "a",
        },
        {
          rowId: "bad",
          category: "B",
          severity: "critical",
          confidence: 0.5,
          savingsMonthly: 10,
          reason: "",
          action: "a",
        },
        {
          rowId: "key1-ws1",
          category: "C",
          severity: "critical",
          confidence: 0.5,
          savingsMonthly: 50,
          reason: "r",
          action: "a",
        },
      ],
      [row],
      ctx
    );
    expect(out).toHaveLength(2); // empty-reason dropped
    expect(out[0].sev).toBe(Severity.CRITICAL);
    expect(out[1].sev).toBe(Severity.INFO);
  });
});

describe("mergeLlmFindings guardrails", () => {
  // A cheap Haiku row — downgrades to pricier tiers must be rejected.
  const haikuRow: UsageSummary = {
    ...row,
    id: "key2-ws1",
    name: "key2",
    model: "claude-haiku-3",
    ml: "Haiku 3",
    cur: 0.03,
  };
  const f = (over: Partial<Record<string, unknown>>) => ({
    rowId: "key1-ws1",
    category: "X",
    severity: "warning",
    confidence: 0.7,
    savingsMonthly: 10,
    reason: "r",
    action: "a",
    ...over,
  });

  it("drops a 'downgrade' whose target is not cheaper than the row's model", () => {
    const out = mergeLlmFindings(
      [
        f({
          rowId: "key2-ws1",
          category: "Model Downgrade → Sonnet",
          savingsMonthly: 0.01,
        }),
        f({
          rowId: "key2-ws1",
          category: "Model Downgrade → Haiku",
          savingsMonthly: 0.01,
        }),
      ],
      [haikuRow],
      ctx
    );
    // Haiku→Sonnet (upgrade) and Haiku→Haiku (no-op) both dropped.
    expect(out).toHaveLength(0);
  });

  it("keeps only the single best downgrade per row", () => {
    const out = mergeLlmFindings(
      [
        f({ category: "Model Downgrade → Sonnet", savingsMonthly: 80 }),
        f({ category: "Model Downgrade → Haiku", savingsMonthly: 90 }),
      ],
      [row],
      ctx
    );
    expect(out).toHaveLength(1);
    expect(out[0].cat).toContain("Haiku");
    expect(out[0].sav).toBe(90);
  });

  it("caps cumulative savings per row at the row's spend", () => {
    const out = mergeLlmFindings(
      [
        f({ category: "Prompt Caching", savingsMonthly: 150 }),
        f({ category: "RAG Optimization", savingsMonthly: 150 }),
      ],
      [row], // cur = 200
      ctx
    );
    const total = out.reduce((s, x) => s + x.sav, 0);
    expect(total).toBeLessThanOrEqual(200);
    expect(total).toBeCloseTo(200);
  });

  it("drops zero-savings cost findings as noise", () => {
    const out = mergeLlmFindings(
      [f({ category: "Batch API Migration", savingsMonthly: 0 })],
      [row],
      ctx
    );
    expect(out).toHaveLength(0);
  });

  it("drops cost findings the cumulative cap zeroed out (no $0 'quality' noise)", () => {
    // First finding claims the row's whole cost; later ones get capped to $0
    // and must not survive as junk "Quality improvement" rows.
    const out = mergeLlmFindings(
      [
        f({ category: "Prompt Caching", savingsMonthly: 200 }), // = full cur
        f({ category: "RAG Optimization", savingsMonthly: 50 }),
        f({ category: "Batch API Migration", savingsMonthly: 50 }),
      ],
      [row], // cur = 200
      ctx
    );
    expect(out).toHaveLength(1);
    expect(out[0].cat).toBe("Prompt Caching");
    expect(out.every((x) => x.sav > 0)).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the analysis rules and vendor-appropriate models", () => {
    expect(buildSystemPrompt("anthropic")).toContain("claude-haiku-4-5");
    expect(buildSystemPrompt("openai")).toContain("gpt-4o-mini");
    expect(buildSystemPrompt("anthropic")).toContain("RAG CONTEXT BLOAT");
  });
});
