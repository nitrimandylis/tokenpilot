import { describe, it, expect } from "vitest";
import { capRowSavings, rowKeyOf } from "@/lib/savingsCap";
import { mergeConsensus } from "@/lib/nim/analysis";
import type { Finding } from "@/types";
import { Severity, AnthropicCategory } from "@/types/analysis";

const slug = (c: string) => c.replace(/[^a-z0-9]/gi, "-").toLowerCase();

// Minimal finding on row `key1-ws1` with the given category and savings.
function mk(
  cat: AnthropicCategory,
  sav: number,
  over: Partial<Finding> = {}
): Finding {
  const cur = over.cur ?? 100;
  return {
    id: `key1-ws1-${slug(cat)}`,
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
    cur,
    opt: cur - sav,
    sav,
    reason: "r",
    action: "a",
    sev: Severity.WARNING,
    cat,
    conf: 0.8,
    impact: `$${sav.toFixed(2)}/mo`,
    activeDays: 25,
    temporal: {
      burstiness: 0,
      consistency: 0,
      batchCandidate: false,
      meanDaily: 0,
    },
    source: "rules",
    ...over,
  };
}

describe("capRowSavings", () => {
  it("caps a row's cumulative savings at its spend, biggest finding first", () => {
    const out = capRowSavings([
      mk(AnthropicCategory.PROMPT_CACHING, 80),
      mk(AnthropicCategory.BATCH_API_MIGRATION, 50),
    ]);
    expect(out.map((f) => f.sav)).toEqual([80, 20]);
    expect(out[1].opt).toBe(80);
    expect(out[1].impact).toBe("$20.00/mo (20%)");
    expect(out.reduce((s, f) => s + f.sav, 0)).toBeLessThanOrEqual(100);
  });

  it("drops cost findings the cap zeroes out, keeps zero-savings upgrades", () => {
    const out = capRowSavings([
      mk(AnthropicCategory.PROMPT_CACHING, 100),
      mk(AnthropicCategory.BATCH_API_MIGRATION, 50), // no headroom left
      mk(AnthropicCategory.MODEL_UPGRADE, 0),
    ]);
    expect(out.map((f) => f.cat)).toEqual([
      AnthropicCategory.PROMPT_CACHING,
      AnthropicCategory.MODEL_UPGRADE,
    ]);
  });

  it("rows are independent and under-cap findings pass through untouched", () => {
    const other = mk(AnthropicCategory.PROMPT_CACHING, 90, {
      id: `key2-ws1-${slug(AnthropicCategory.PROMPT_CACHING)}`,
    });
    const out = capRowSavings([
      mk(AnthropicCategory.BATCH_API_MIGRATION, 50),
      other,
    ]);
    expect(out.map((f) => f.sav)).toEqual([50, 90]);
    expect(out[0].impact).toBe("$50.00/mo"); // untouched, not reformatted
  });

  it("is idempotent", () => {
    const capped = capRowSavings([
      mk(AnthropicCategory.PROMPT_CACHING, 80),
      mk(AnthropicCategory.BATCH_API_MIGRATION, 50),
    ]);
    expect(capRowSavings(capped).map((f) => f.sav)).toEqual([80, 20]);
  });

  it("rowKeyOf strips the category slug and collapses org findings", () => {
    expect(rowKeyOf(mk(AnthropicCategory.PROMPT_CACHING, 10))).toBe("key1-ws1");
    expect(
      rowKeyOf(
        mk(AnthropicCategory.WORKSPACE_ORGANIZATION, 0, { id: "anything" })
      )
    ).toBe("org");
  });
});

describe("mergeConsensus applies the cap across engines", () => {
  it("caps when rule and LLM-only findings on one row sum past its spend", () => {
    const rules = [mk(AnthropicCategory.PROMPT_CACHING, 60)];
    const llm = [
      mk(AnthropicCategory.BATCH_API_MIGRATION, 60, { source: "llm" }),
    ];
    const out = mergeConsensus(rules, llm);
    expect(out.reduce((s, f) => s + f.sav, 0)).toBe(100);
    expect(out.find((f) => f.source === "rules")?.sav).toBe(60);
    expect(out.find((f) => f.source === "llm")?.sav).toBe(40);
  });
});
