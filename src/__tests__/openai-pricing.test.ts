import { describe, it, expect } from "vitest";
import { MP_OPENAI, prOpenAI, tcOpenAI } from "@/lib/openai/pricing";
import { findIssuesOpenAI } from "@/lib/openai/analysis";
import { OpenAICategory } from "@/types/analysis";

/*
 * prOpenAI resolves a model id by substring, and several table keys are
 * prefixes of others. Walking the table in insertion order matched the prefix
 * first, so every "-mini" variant priced as its full-size parent — gpt-4o-mini
 * at GPT-4o's $2.50/$10 instead of $0.15/$0.60, a 16.7x overcharge. These pin
 * the resolution order and the one rule the bug silently disabled.
 */

describe("prOpenAI resolves the most specific model", () => {
  const cases: [string, string, number, number][] = [
    ["gpt-4o", "GPT-4o", 2.5, 10],
    ["gpt-4o-mini", "GPT-4o Mini", 0.15, 0.6],
    ["o1", "o1", 15, 60],
    ["o1-mini", "o1 Mini", 3, 12],
    ["o3", "o3", 2, 8],
    ["o3-mini", "o3 Mini", 1.1, 4.4],
    ["gpt-4", "GPT-4", 30, 60],
    ["gpt-4-32k", "GPT-4 32k", 60, 120],
    ["gpt-3.5-turbo", "GPT-3.5 Turbo", 0.5, 1.5],
  ];

  for (const [model, label, i, o] of cases) {
    it(`${model} prices as ${label}`, () => {
      const p = prOpenAI(model);
      expect(p.l).toBe(label);
      expect(p.i).toBe(i);
      expect(p.o).toBe(o);
    });
  }

  it("resolves dated and suffixed ids to the same entry", () => {
    expect(prOpenAI("gpt-4o-mini-2024-07-18").l).toBe("GPT-4o Mini");
    expect(prOpenAI("gpt-4o-2024-08-06").l).toBe("GPT-4o");
    expect(prOpenAI("o3-mini-2025-01-31").l).toBe("o3 Mini");
  });

  it("never resolves a longer key to a shorter one that it contains", () => {
    // The general property behind every case above: for any two table keys
    // where one contains the other, the longer must win.
    const keys = Object.keys(MP_OPENAI);
    for (const key of keys) {
      const shadowing = keys.filter((k) => k !== key && key.includes(k));
      if (shadowing.length === 0) continue;
      expect(prOpenAI(key), `${key} shadowed by ${shadowing}`).toBe(
        MP_OPENAI[key]
      );
    }
  });

  it("still falls back to GPT-4o for an unknown model", () => {
    const p = prOpenAI("some-future-model");
    expect(p.i).toBe(2.5);
    expect(p.o).toBe(10);
    expect(p.g).toBe(0);
  });
});

describe("the mini downgrade rule the mispricing disabled", () => {
  it("fires on a GPT-4o row and prices the remedy at mini rates", () => {
    // Textbook candidate: high volume, short outputs. While gpt-4o-mini
    // resolved to GPT-4o pricing, costMiniDowngrade returned the row's own
    // cost, savings came to 0, and addFinding's `sav > 0.5` floor dropped the
    // finding — so the engine's headline OpenAI advice never appeared on the
    // commonest OpenAI workload there is.
    const inp = 60_000_000;
    const out = 3_000_000;
    const row = {
      model: "gpt-4o",
      project_id: "proj_1",
      line_item: "GPT-4o",
      cost: tcOpenAI("gpt-4o", inp, out),
      inp,
      out,
      reqs: 40_000,
      activeDays: 28,
    };

    const f = findIssuesOpenAI([row], []).find(
      (x) => x.cat === OpenAICategory.MODEL_DOWNGRADE_MINI
    );

    expect(f).toBeDefined();
    expect(f!.opt).toBeCloseTo(tcOpenAI("gpt-4o-mini", inp, out), 10);
    // ~94% of the row's spend, not the 0 the bug produced.
    expect(f!.sav / f!.cur).toBeGreaterThan(0.9);
  });

  it("defers to RAG bloat and prompt bloat instead of starving them", () => {
    // Mini is ~94% cheaper, so rule 3 outbids every other finding for the
    // per-row savings cap. It now stands down on rows those rules own.
    const ragRow = {
      model: "gpt-4o",
      project_id: "proj_1",
      line_item: "GPT-4o",
      cost: 0,
      inp: 32_000_000, // ratio 28:1, over rule 2's 12:1 and 10M gates
      out: 1_150_000,
      reqs: 1135,
      activeDays: 26,
    };
    const ragCats = findIssuesOpenAI([ragRow], []).map((f) => f.cat);
    expect(ragCats).toContain(OpenAICategory.RAG_OPTIMIZATION);
    expect(ragCats).not.toContain(OpenAICategory.MODEL_DOWNGRADE_MINI);

    const bloatRow = {
      model: "gpt-4o",
      project_id: "proj_1",
      line_item: "GPT-4o",
      cost: 0,
      inp: 5_700_000, // avg input ~15.7k tok, over rule 3's new 10k ceiling
      out: 190_000,
      reqs: 362,
      activeDays: 24,
    };
    const bloatCats = findIssuesOpenAI([bloatRow], []).map((f) => f.cat);
    expect(bloatCats).toContain(OpenAICategory.PROMPT_OPTIMIZATION);
    expect(bloatCats).not.toContain(OpenAICategory.MODEL_DOWNGRADE_MINI);
  });
});
