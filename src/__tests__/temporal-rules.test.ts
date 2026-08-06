import { describe, it, expect } from "vitest";
import { temporalFromDailyCounts, findIssues } from "@/lib/anthropic/analysis";
import { aggOpenAI, findIssuesOpenAI } from "@/lib/openai/analysis";
import { AnthropicCategory, OpenAICategory } from "@/types/analysis";
import type { UsageBucket } from "@/types";

// July 2026: the 6th, 13th, 20th, 27th are Mondays.
const MONDAYS = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"];

function allJulyDays(): string[] {
  return Array.from(
    { length: 31 },
    (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}`
  );
}

describe("temporalFromDailyCounts weekday metrics", () => {
  it("flags a Monday-only workload as a recurring weekly cadence", () => {
    const daily: Record<string, number> = {};
    for (const d of MONDAYS) daily[d] = 500;
    const t = temporalFromDailyCounts(daily);
    expect(t.weekdayConcentration).toBe(1);
    expect(t.dominantWeekdays).toEqual(["Monday"]);
  });

  it("does not call one busy day a cadence", () => {
    const t = temporalFromDailyCounts({
      "2026-07-06": 5000,
      "2026-07-07": 10,
      "2026-07-08": 10,
    });
    // Top weekday occurs on a single date — no recurrence, no cadence.
    expect(t.dominantWeekdays).toBeUndefined();
  });

  it("computes weekend parity: flat pipelines ~1, office traffic well below", () => {
    const flat: Record<string, number> = {};
    const office: Record<string, number> = {};
    for (const d of allJulyDays()) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      flat[d] = 100;
      office[d] = dow === 0 || dow === 6 ? 20 : 100;
    }
    expect(temporalFromDailyCounts(flat).weekendParity).toBeCloseTo(1, 5);
    expect(temporalFromDailyCounts(office).weekendParity).toBeCloseTo(0.2, 5);
  });
});

function anthBuckets(
  days: string[],
  reqsPerDay: number,
  inpPerDay: number
): UsageBucket[] {
  return days.map((d) => ({
    bucket_start: `${d}T00:00:00Z`,
    model: "claude-sonnet-4-6-20250514",
    api_key_id: "key_x",
    input_tokens: inpPerDay,
    output_tokens: Math.floor(inpPerDay / 10),
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    request_count: reqsPerDay,
  }));
}

describe("Anthropic rule 5d — weekly-cadence scheduled job", () => {
  it("diagnoses a Monday-only workload as a scheduled job, not just bursty", () => {
    const buckets = anthBuckets(MONDAYS, 300, 5_000_000);
    const rows = [
      {
        model: "claude-sonnet-4-6-20250514",
        kid: "key_x",
        wid: undefined,
        inp: 20_000_000,
        out: 2_000_000,
        cached: 0,
        cacheCreated: 0,
        reqs: 1200,
        activeDays: 4,
      },
    ];
    const f = findIssues(rows, [], buckets).find(
      (x) => x.cat === AnthropicCategory.BATCH_API_MIGRATION
    );
    expect(f).toBeDefined();
    expect(f!.reason).toContain("Monday");
    expect(f!.reason).toContain("scheduled-job cadence");
    expect(f!.opt).toBeCloseTo(f!.cur * 0.5, 6);
  });
});

describe("Anthropic rule 5c — steady batch with weekend gate", () => {
  const mkRow = (reqs: number) => [
    {
      model: "claude-sonnet-4-6-20250514",
      kid: "key_x",
      wid: undefined,
      inp: 60_000_000,
      out: 6_000_000,
      cached: 60_000_000, // high cache rate so rule 3 stays quiet
      cacheCreated: 0,
      reqs,
      activeDays: 31,
    },
  ];

  it("fires on steady volume that runs flat through weekends", () => {
    const flat = anthBuckets(allJulyDays(), 400, 2_000_000);
    const f = findIssues(mkRow(12_400), [], flat).find(
      (x) => x.cat === AnthropicCategory.BATCH_API_MIGRATION
    );
    expect(f).toBeDefined();
    expect(f!.reason).toContain("Steady high-volume pattern");
  });

  it("stays quiet when traffic dips on weekends (interactive workload)", () => {
    const office = allJulyDays().map((d) => {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      const reqs = dow === 0 || dow === 6 ? 100 : 500;
      return anthBuckets([d], reqs, 2_000_000)[0];
    });
    const f = findIssues(mkRow(12_000), [], office).find(
      (x) => x.cat === AnthropicCategory.BATCH_API_MIGRATION
    );
    expect(f).toBeUndefined();
  });
});

describe("OpenAI rule 4c — weekly-cadence scheduled job", () => {
  it("aggOpenAI attaches temporal data and 4c wins over generic bursty rule 4", () => {
    const usage = {
      data: MONDAYS.map((d) => ({
        aggregation_timestamp: Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000),
        n_requests: 400,
        operation: "completions",
        snapshot_id: "gpt-4o",
        n_context_tokens_total: 3_000_000,
        n_generated_tokens_total: 300_000,
        model: "gpt-4o",
        service: "completions",
        bucket_start_time: Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000),
        project_id: "proj_evals",
        input_tokens: 3_000_000,
        output_tokens: 300_000,
        num_model_requests: 400,
      })),
    };
    const rows = aggOpenAI(usage as never);
    expect(rows[0].temporal?.dominantWeekdays).toEqual(["Monday"]);

    const f = findIssuesOpenAI(rows, []).find(
      (x) => x.cat === OpenAICategory.BATCH_API_MIGRATION
    );
    expect(f).toBeDefined();
    expect(f!.reason).toContain("Monday");
    expect(f!.reason).toContain("scheduled-job cadence");
  });
});
