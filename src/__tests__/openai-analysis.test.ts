import { describe, it, expect } from "vitest";
import {
  aggOpenAI,
  aggOpenAICosts,
  findIssuesOpenAI,
} from "@/lib/openai/analysis";

/* ─── Contract tests: response shape → parser ─── */

describe("aggOpenAI (usage API shape)", () => {
  const makeUsageData = (overrides: object = {}) =>
    ({
      data: [
        {
          api_key_id: "key_1",
          project_id: "proj_1",
          model: "gpt-4o",
          input_tokens: 100_000,
          output_tokens: 10_000,
          num_model_requests: 50,
          bucket_start_time: 1704067200,
          ...overrides,
        },
      ],
    }) as unknown as import("@/lib/openai/api").OpenAIUsageData;

  it("returns empty for empty data", () => {
    expect(aggOpenAI({ data: [] })).toEqual([]);
  });

  it("aggregates tokens from usage API", () => {
    const rows = aggOpenAI(makeUsageData());
    expect(rows).toHaveLength(1);
    expect(rows[0].inp).toBe(100_000);
    expect(rows[0].out).toBe(10_000);
    expect(rows[0].reqs).toBe(50);
    expect(rows[0].model).toBe("gpt-4o");
  });

  it("groups rows by model+project", () => {
    const data = {
      data: [
        {
          api_key_id: "key_1",
          project_id: "proj_1",
          model: "gpt-4o",
          input_tokens: 50_000,
          output_tokens: 5_000,
          num_model_requests: 20,
          bucket_start_time: 1704067200,
        },
        {
          api_key_id: "key_1",
          project_id: "proj_1",
          model: "gpt-4o",
          input_tokens: 50_000,
          output_tokens: 5_000,
          num_model_requests: 30,
          bucket_start_time: 1704153600,
        },
        {
          api_key_id: "key_1",
          project_id: "proj_1",
          model: "gpt-4o-mini",
          input_tokens: 100_000,
          output_tokens: 10_000,
          num_model_requests: 100,
          bucket_start_time: 1704067200,
        },
      ],
    } as unknown as import("@/lib/openai/api").OpenAIUsageData;
    const rows = aggOpenAI(data);
    expect(rows).toHaveLength(2);
    const gpt4o = rows.find((r) => r.model === "gpt-4o");
    expect(gpt4o!.inp).toBe(100_000);
    expect(gpt4o!.reqs).toBe(50);
  });
});

describe("aggOpenAICosts (costs API shape)", () => {
  const makeCostsData = (overrides: object = {}) => ({
    data: [
      {
        start_time: 1704067200,
        end_time: 1704153600,
        results: [
          {
            line_item: "GPT-4o",
            project_id: "proj_1",
            project_name: "My Project",
            amount: { value: 12.5, currency: "usd" },
            ...overrides,
          },
        ],
      },
    ],
  });

  it("returns empty for null/undefined input", () => {
    expect(aggOpenAICosts(null)).toEqual([]);
    expect(aggOpenAICosts(undefined)).toEqual([]);
    expect(aggOpenAICosts({ data: [] })).toEqual([]);
  });

  it("extracts cost from costs API", () => {
    const rows = aggOpenAICosts(makeCostsData());
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBe(12.5);
    expect(rows[0].model).toBe("GPT-4o");
  });

  it("sums costs for same line_item across buckets", () => {
    const data = {
      data: [
        {
          start_time: 1704067200,
          results: [
            {
              line_item: "GPT-4o",
              project_id: "proj_1",
              amount: { value: 5.0 },
            },
          ],
        },
        {
          start_time: 1704153600,
          results: [
            {
              line_item: "GPT-4o",
              project_id: "proj_1",
              amount: { value: 7.5 },
            },
          ],
        },
      ],
    };
    const rows = aggOpenAICosts(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBeCloseTo(12.5);
  });

  it("creates separate rows for different line items", () => {
    const data = {
      data: [
        {
          start_time: 1704067200,
          results: [
            {
              line_item: "GPT-4o",
              project_id: "proj_1",
              amount: { value: 5.0 },
            },
            {
              line_item: "Embeddings",
              project_id: "proj_1",
              amount: { value: 2.0 },
            },
          ],
        },
      ],
    };
    const rows = aggOpenAICosts(data);
    expect(rows).toHaveLength(2);
  });
});

describe("findIssuesOpenAI", () => {
  it("returns empty array when no rows", () => {
    expect(findIssuesOpenAI([], [])).toEqual([]);
  });

  it("detects model downgrade opportunity (GPT-4o → GPT-4o-mini)", () => {
    const rows = Array.from({ length: 1 }, () => ({
      model: "gpt-4o-2024-08-06",
      project_id: "proj_1",
      line_item: "GPT-4o",
      cost: 80,
      inp: 5_000_000,
      out: 400_000,
      reqs: 5000,
      activeDays: 25,
    }));
    const findings = findIssuesOpenAI(rows, []);
    const downgrade = findings.find(
      (f) => f.cat === "Model Downgrade → GPT-4o-mini"
    );
    expect(downgrade).toBeDefined();
    expect(downgrade!.sav).toBeGreaterThan(0);
  });

  it("confidence scores are between 0 and 1", () => {
    const rows = [
      {
        model: "gpt-4o-2024-08-06",
        project_id: "proj_1",
        line_item: "GPT-4o",
        cost: 150,
        inp: 10_000_000,
        out: 500_000,
        reqs: 10000,
        activeDays: 28,
      },
    ];
    const findings = findIssuesOpenAI(rows, []);
    for (const f of findings) {
      expect(f.conf).toBeGreaterThanOrEqual(0);
      expect(f.conf).toBeLessThanOrEqual(1);
    }
  });

  it("savings are non-negative", () => {
    const rows = [
      {
        model: "gpt-4o-2024-08-06",
        project_id: "proj_1",
        line_item: "GPT-4o",
        cost: 200,
        inp: 20_000_000,
        out: 1_000_000,
        reqs: 20000,
        activeDays: 30,
      },
    ];
    const findings = findIssuesOpenAI(rows, []);
    for (const f of findings) {
      expect(f.sav).toBeGreaterThanOrEqual(0);
    }
  });
});
