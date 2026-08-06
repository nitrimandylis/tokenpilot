import { describe, it, expect, vi } from "vitest";
import { analyzeWithFallback, LLM_FALLBACK_NOTICE } from "@/lib/nim/analysis";
import type { Finding } from "@/types";
import { Severity, AnthropicCategory } from "@/types/analysis";

const ruleFinding: Finding = {
  id: "key1-ws1-caching",
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
  reason: "high input volume with no cache reads",
  action: "add cache_control breakpoints",
  sev: Severity.WARNING,
  cat: AnthropicCategory.PROMPT_CACHING,
  conf: 0.8,
  impact: "$80.00/mo (40%)",
  activeDays: 25,
  temporal: {
    burstiness: 0.2,
    consistency: 0.8,
    batchCandidate: false,
    meanDaily: 300_000,
  },
};

describe("analyzeWithFallback", () => {
  it("falls back to the rule engine and sets the notice when the LLM throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let rulesRan = false;

    const out = await analyzeWithFallback(
      () => Promise.reject(new Error("NIM analysis failed (503): down")),
      () => {
        rulesRan = true;
        return [ruleFinding];
      }
    );

    expect(rulesRan).toBe(true);
    expect(out.findings).toEqual([ruleFinding]);
    expect(out.engine).toBe("rules");
    expect(out.notice).toBe(LLM_FALLBACK_NOTICE);
    expect(out.llmUsage).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("returns the LLM findings and usage with engine 'llm' on success", async () => {
    const usage = {
      promptTokens: 4000,
      completionTokens: 800,
      costUsd: 0.00192,
    };
    let rulesRan = false;

    const out = await analyzeWithFallback(
      async () => ({ findings: [ruleFinding], usage }),
      () => {
        rulesRan = true;
        return [];
      }
    );

    expect(rulesRan).toBe(false);
    expect(out.findings).toEqual([ruleFinding]);
    expect(out.engine).toBe("llm");
    expect(out.notice).toBeUndefined();
    expect(out.llmUsage).toEqual(usage);
  });
});
