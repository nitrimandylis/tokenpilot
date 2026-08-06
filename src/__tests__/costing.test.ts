import { describe, it, expect } from "vitest";
import {
  cacheWriteEconomics,
  costBatchDiscount,
  costEnableCaching,
  costGenerationUpgrade,
  costHaikuDowngrade,
  costRagReduction,
  costSonnetDowngrade,
  optimizedCostAnthropic,
  type CostRow,
} from "@/lib/anthropic/costing";
import {
  costBatchDiscountOpenAI,
  costEnableCachingOpenAI,
  costGpt4oDowngrade,
  costLegacyGpt4Upgrade,
  costMiniDowngrade,
  costModelUpgradeOpenAI,
  costPromptTrim,
  costRagReductionOpenAI,
  costTenPercentTrim,
  optimizedCostOpenAI,
  type OpenAICostRow,
} from "@/lib/openai/costing";
import { agg, findIssues } from "@/lib/anthropic/analysis";
import { findIssuesOpenAI } from "@/lib/openai/analysis";
import { tc } from "@/lib/anthropic/pricing";
import { tcOpenAI } from "@/lib/openai/pricing";
import { AnthropicCategory, OpenAICategory } from "@/types/analysis";
import type { UsageBucket } from "@/types";

const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}T00:00:00Z`;

function anthBuckets(
  model: string,
  perDay: Partial<UsageBucket>,
  days = 25
): UsageBucket[] {
  return Array.from({ length: days }, (_, i) => ({
    bucket_start: day(i + 1),
    model,
    api_key_id: "key_test",
    workspace_id: "ws_test",
    input_tokens: 0,
    output_tokens: 0,
    request_count: 0,
    ...perDay,
  }));
}

function anthCostRow(model: string, buckets: UsageBucket[]): CostRow {
  const [r] = agg(buckets);
  return {
    model,
    inp: r.inp,
    out: r.out,
    cached: r.cached,
    cacheCreated: r.cacheCreated,
    cur: tc(model, r.inp, r.out),
    conf: 0,
  };
}

/* ─── Anthropic: costing functions match the rule engine's own output ─── */

describe("Anthropic costing functions vs rule engine", () => {
  it("costHaikuDowngrade matches rule 1's optimized cost", () => {
    const buckets = anthBuckets("claude-sonnet-4-6", {
      input_tokens: 500_000,
      output_tokens: 60_000,
      request_count: 800,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.MODEL_DOWNGRADE_HAIKU
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(
      costHaikuDowngrade(anthCostRow("claude-sonnet-4-6", buckets)),
      10
    );
  });

  it("costRagReduction matches rule 2's optimized cost", () => {
    const buckets = anthBuckets("claude-sonnet-4-6", {
      input_tokens: 12_000_000,
      output_tokens: 200_000,
      request_count: 200,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.RAG_OPTIMIZATION
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(
      costRagReduction(anthCostRow("claude-sonnet-4-6", buckets), f!.conf),
      10
    );
  });

  it("costRagReduction reprices Opus rows at Sonnet", () => {
    const row: CostRow = {
      model: "claude-opus-4-5",
      inp: 10_000_000,
      out: 100_000,
      cached: 0,
      cacheCreated: 0,
      cur: tc("claude-opus-4-5", 10_000_000, 100_000),
      conf: 0,
    };
    // 50% input reduction at Sonnet ($3/$15) rates
    expect(costRagReduction(row, 0.9)).toBeCloseTo(
      (5_000_000 / 1e6) * 3 + (100_000 / 1e6) * 15,
      10
    );
  });

  it("costEnableCaching matches rule 3's optimized cost", () => {
    const buckets = anthBuckets("claude-sonnet-4-6", {
      input_tokens: 3_000_000,
      output_tokens: 200_000,
      request_count: 300,
      cache_read_input_tokens: 0,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.PROMPT_CACHING
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(
      costEnableCaching(anthCostRow("claude-sonnet-4-6", buckets)),
      10
    );
  });

  it("costSonnetDowngrade matches rule 4's optimized cost", () => {
    const buckets = anthBuckets("claude-opus-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 300_000,
      request_count: 200,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.MODEL_DOWNGRADE_SONNET
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(
      costSonnetDowngrade(anthCostRow("claude-opus-4-5", buckets)),
      10
    );
  });

  it("costBatchDiscount matches rule 5's optimized cost (50% off)", () => {
    // Bursty: big spikes with dead days in between.
    const buckets: UsageBucket[] = Array.from({ length: 20 }, (_, i) => ({
      bucket_start: day(i + 1),
      model: "claude-sonnet-4-6",
      api_key_id: "key_test",
      workspace_id: "ws_test",
      input_tokens: i % 5 === 0 ? 3_000_000 : 0,
      output_tokens: i % 5 === 0 ? 500_000 : 0,
      request_count: i % 5 === 0 ? 2000 : 0,
    }));
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.BATCH_API_MIGRATION
    );
    expect(f).toBeDefined();
    const row = anthCostRow("claude-sonnet-4-6", buckets);
    expect(f!.opt).toBeCloseTo(costBatchDiscount(row), 10);
    expect(costBatchDiscount(row)).toBeCloseTo(row.cur * 0.5, 10);
  });

  it("cacheWriteEconomics matches rule 5b's optimized cost", () => {
    const buckets = anthBuckets("claude-sonnet-4-6", {
      input_tokens: 400_000,
      output_tokens: 300_000,
      request_count: 100,
      cache_creation_input_tokens: 400_000,
      cache_read_input_tokens: 20_000,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.PROMPT_CACHING
    );
    expect(f).toBeDefined();
    const econ = cacheWriteEconomics(anthCostRow("claude-sonnet-4-6", buckets));
    expect(econ).not.toBeNull();
    expect(f!.opt).toBeCloseTo(econ!.opt, 10);
    expect(econ!.netCacheCost).toBeGreaterThan(1);
  });

  it("cacheWriteEconomics returns null without cache writes", () => {
    expect(
      cacheWriteEconomics({
        model: "claude-sonnet-4-6",
        inp: 1e6,
        out: 1e5,
        cached: 0,
        cacheCreated: 0,
        cur: 5,
        conf: 0,
      })
    ).toBeNull();
  });

  it("costGenerationUpgrade matches rule 6 and never exceeds current cost", () => {
    const buckets = anthBuckets("claude-3-opus-20240229", {
      input_tokens: 200_000,
      output_tokens: 40_000,
      request_count: 50,
    });
    const rows = agg(buckets);
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.MODEL_UPGRADE
    );
    expect(f).toBeDefined();
    const row = anthCostRow("claude-3-opus-20240229", buckets);
    expect(f!.opt).toBeCloseTo(costGenerationUpgrade(row), 10);
    expect(costGenerationUpgrade(row)).toBeLessThanOrEqual(row.cur);
  });
});

describe("optimizedCostAnthropic dispatcher", () => {
  const row: CostRow = {
    model: "claude-opus-4-6",
    inp: 10_000_000,
    out: 500_000,
    cached: 0,
    cacheCreated: 0,
    cur: tc("claude-opus-4-6", 10_000_000, 500_000),
    conf: 0.8,
  };

  it("routes each category to its formula", () => {
    expect(
      optimizedCostAnthropic(AnthropicCategory.MODEL_DOWNGRADE_HAIKU, row)
    ).toBeCloseTo(costHaikuDowngrade(row), 10);
    expect(
      optimizedCostAnthropic(AnthropicCategory.MODEL_DOWNGRADE_SONNET, row)
    ).toBeCloseTo(costSonnetDowngrade(row), 10);
    expect(
      optimizedCostAnthropic(AnthropicCategory.RAG_OPTIMIZATION, row)
    ).toBeCloseTo(costRagReduction(row, row.conf), 10);
    expect(
      optimizedCostAnthropic(AnthropicCategory.PROMPT_CACHING, row)
    ).toBeCloseTo(costEnableCaching(row), 10);
    expect(
      optimizedCostAnthropic(AnthropicCategory.BATCH_API_MIGRATION, row)
    ).toBeCloseTo(row.cur * 0.5, 10);
    expect(
      optimizedCostAnthropic(AnthropicCategory.MODEL_UPGRADE, row)
    ).toBeCloseTo(costGenerationUpgrade(row), 10);
  });

  it("returns null for categories with no formula or unusable rows", () => {
    expect(
      optimizedCostAnthropic(AnthropicCategory.WORKSPACE_ORGANIZATION, row)
    ).toBeNull();
    expect(
      optimizedCostAnthropic(AnthropicCategory.PROMPT_OPTIMIZATION, row)
    ).toBeNull();
    expect(
      optimizedCostAnthropic(AnthropicCategory.RAG_OPTIMIZATION, {
        ...row,
        inp: 0,
      })
    ).toBeNull();
    expect(
      optimizedCostAnthropic(AnthropicCategory.MODEL_DOWNGRADE_HAIKU, {
        ...row,
        inp: 0,
        out: 0,
      })
    ).toBeNull();
  });
});

/* ─── OpenAI: costing functions match the rule engine's own output ─── */

function oaiRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    model: "gpt-4o-2024-08-06",
    project_id: "proj_1",
    line_item: "GPT-4o",
    cost: 0,
    inp: 5_000_000,
    out: 400_000,
    reqs: 5000,
    activeDays: 25,
    ...over,
  };
}

function oaiCostRow(r: ReturnType<typeof oaiRow>): OpenAICostRow {
  return {
    model: (r.model as string) || (r.line_item as string) || "",
    inp: r.inp as number,
    out: r.out as number,
    cur:
      (r.cost as number) > 0
        ? (r.cost as number)
        : tcOpenAI(r.model as string, r.inp as number, r.out as number),
    conf: 0,
  };
}

describe("OpenAI costing functions vs rule engine", () => {
  it("costMiniDowngrade matches the mini-downgrade rules", () => {
    const r = oaiRow({ cost: 80 });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.MODEL_DOWNGRADE_MINI
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costMiniDowngrade(oaiCostRow(r)), 10);
  });

  it("costRagReductionOpenAI matches rule 2's optimized cost", () => {
    const r = oaiRow({ inp: 20_000_000, out: 500_000, reqs: 1500, cost: 120 });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.RAG_OPTIMIZATION
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(
      costRagReductionOpenAI(oaiCostRow(r), f!.conf),
      10
    );
  });

  it("costEnableCachingOpenAI matches rule 0's optimized cost", () => {
    const r = oaiRow({ inp: 10_000_000, out: 2_000_000, reqs: 2000, cost: 60 });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.PROMPT_CACHING
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costEnableCachingOpenAI(oaiCostRow(r)), 10);
  });

  it("costBatchDiscountOpenAI matches the batch rules (50% off)", () => {
    const r = oaiRow({
      inp: 30_000_000,
      out: 3_000_000,
      reqs: 30_000,
      cost: 200,
      activeDays: 28,
    });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.BATCH_API_MIGRATION
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costBatchDiscountOpenAI(oaiCostRow(r)), 10);
    expect(f!.opt).toBeCloseTo(f!.cur * 0.5, 10);
  });

  it("costGpt4oDowngrade matches the o-series overkill rule", () => {
    // ao 260 keeps rule 1 (mini downgrade, ao < 200) from stacking on this
    // row and eating the cap's headroom.
    const r = oaiRow({
      model: "o1-preview",
      line_item: "o1",
      inp: 2_000_000,
      out: 260_000,
      reqs: 1000,
      cost: 45,
    });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.REASONING_MODEL_OVERKILL
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costGpt4oDowngrade(oaiCostRow(r)), 10);
  });

  it("costPromptTrim matches rule 8's optimized cost", () => {
    // Sized so only rule 8 (and the small rule-6 info) fires: inp under the
    // RAG and 4o-overkill gates, reqs under the steady-batch gate — otherwise
    // those findings consume the per-row savings cap.
    const r = oaiRow({
      inp: 4_800_000,
      out: 150_000,
      reqs: 500,
      cost: 40,
    });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.PROMPT_OPTIMIZATION
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costPromptTrim(oaiCostRow(r)), 10);
  });

  it("costLegacyGpt4Upgrade matches rule 7's optimized cost", () => {
    const r = oaiRow({
      model: "gpt-4-0613",
      line_item: "GPT-4",
      inp: 1_000_000,
      out: 100_000,
      reqs: 300,
      cost: 40,
    });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.MODEL_UPGRADE
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costLegacyGpt4Upgrade(oaiCostRow(r)), 10);
  });

  it("costTenPercentTrim matches the high-impact rules", () => {
    // Costs-API-only row (no token data) so token-based rules can't stack
    // and crowd out the high-impact finding under the per-row cap.
    const r = oaiRow({ cost: 90, inp: 0, out: 0, reqs: 0 });
    const f = findIssuesOpenAI([r], []).find(
      (x) => x.cat === OpenAICategory.HIGH_IMPACT_OPPORTUNITY
    );
    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(costTenPercentTrim(oaiCostRow(r)), 10);
  });
});

describe("optimizedCostOpenAI dispatcher", () => {
  const row: OpenAICostRow = {
    model: "gpt-4o",
    inp: 5_000_000,
    out: 400_000,
    cur: tcOpenAI("gpt-4o", 5_000_000, 400_000),
    conf: 0.8,
  };

  it("routes each category to its formula", () => {
    expect(
      optimizedCostOpenAI(OpenAICategory.MODEL_DOWNGRADE_MINI, row)
    ).toBeCloseTo(costMiniDowngrade(row), 10);
    expect(
      optimizedCostOpenAI(OpenAICategory.RAG_OPTIMIZATION, row)
    ).toBeCloseTo(costRagReductionOpenAI(row, row.conf), 10);
    expect(optimizedCostOpenAI(OpenAICategory.PROMPT_CACHING, row)).toBeCloseTo(
      costEnableCachingOpenAI(row),
      10
    );
    expect(
      optimizedCostOpenAI(OpenAICategory.BATCH_API_MIGRATION, row)
    ).toBeCloseTo(row.cur * 0.5, 10);
    expect(
      optimizedCostOpenAI(OpenAICategory.PROMPT_OPTIMIZATION, row)
    ).toBeCloseTo(costPromptTrim(row), 10);
    expect(optimizedCostOpenAI(OpenAICategory.MODEL_UPGRADE, row)).toBeCloseTo(
      costModelUpgradeOpenAI(row),
      10
    );
  });

  it("returns null for uncostable categories and token-less rows", () => {
    expect(
      optimizedCostOpenAI(OpenAICategory.PROJECT_ORGANIZATION, row)
    ).toBeNull();
    const noTokens: OpenAICostRow = { ...row, inp: 0, out: 0, cur: 50 };
    expect(
      optimizedCostOpenAI(OpenAICategory.MODEL_DOWNGRADE_MINI, noTokens)
    ).toBeNull();
    expect(
      optimizedCostOpenAI(OpenAICategory.RAG_OPTIMIZATION, noTokens)
    ).toBeNull();
    // Whole-workload discounts still work from cost alone.
    expect(
      optimizedCostOpenAI(OpenAICategory.BATCH_API_MIGRATION, noTokens)
    ).toBeCloseTo(25, 10);
  });
});
