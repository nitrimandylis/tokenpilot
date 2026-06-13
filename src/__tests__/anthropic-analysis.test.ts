import { describe, it, expect } from "vitest";
import {
  agg,
  confidenceScore,
  analyzeTemporalPattern,
  findIssues,
} from "@/lib/anthropic/analysis";
import type { UsageBucket } from "@/types";

/* ─── helpers ─── */

function bucket(
  overrides: Partial<UsageBucket> & { bucket_start: string }
): UsageBucket {
  return {
    model: "claude-sonnet-4-6",
    api_key_id: "key_test",
    workspace_id: "ws_test",
    input_tokens: 0,
    output_tokens: 0,
    request_count: 0,
    ...overrides,
  };
}

function opusBucket(day: string, inp: number, out: number, reqs: number) {
  return bucket({
    bucket_start: `${day}T00:00:00Z`,
    model: "claude-opus-4-5",
    input_tokens: inp,
    output_tokens: out,
    request_count: reqs,
  });
}

function sonnetBucket(day: string, inp: number, out: number, reqs: number) {
  return bucket({
    bucket_start: `${day}T00:00:00Z`,
    model: "claude-sonnet-4-6",
    input_tokens: inp,
    output_tokens: out,
    request_count: reqs,
  });
}

/* ─── agg() ─── */

describe("agg", () => {
  it("returns empty array for empty input", () => {
    expect(agg([])).toEqual([]);
  });

  it("sums tokens across multiple buckets for same model+key+workspace", () => {
    const buckets = [
      bucket({
        bucket_start: "2024-01-01T00:00:00Z",
        input_tokens: 1000,
        output_tokens: 200,
        request_count: 5,
      }),
      bucket({
        bucket_start: "2024-01-02T00:00:00Z",
        input_tokens: 500,
        output_tokens: 100,
        request_count: 3,
      }),
    ];
    const rows = agg(buckets);
    expect(rows).toHaveLength(1);
    expect(rows[0].inp).toBe(1500);
    expect(rows[0].out).toBe(300);
    expect(rows[0].reqs).toBe(8);
  });

  it("creates separate rows for different models", () => {
    const buckets = [
      bucket({
        bucket_start: "2024-01-01T00:00:00Z",
        model: "claude-sonnet-4-6",
        input_tokens: 1000,
        output_tokens: 200,
        request_count: 5,
      }),
      bucket({
        bucket_start: "2024-01-01T00:00:00Z",
        model: "claude-haiku-4-5",
        input_tokens: 500,
        output_tokens: 100,
        request_count: 10,
      }),
    ];
    const rows = agg(buckets);
    expect(rows).toHaveLength(2);
  });

  it("deduplicates active days (same calendar day across multiple buckets)", () => {
    const buckets = [
      bucket({ bucket_start: "2024-01-01T00:00:00Z", request_count: 10 }),
      bucket({ bucket_start: "2024-01-01T06:00:00Z", request_count: 5 }),
      bucket({ bucket_start: "2024-01-02T00:00:00Z", request_count: 3 }),
    ];
    const rows = agg(buckets);
    expect(rows[0].activeDays).toBe(2);
  });

  it("sums cached tokens from both field variants", () => {
    const b1 = bucket({
      bucket_start: "2024-01-01T00:00:00Z",
      cache_read_input_tokens: 300,
    });
    const b2 = bucket({
      bucket_start: "2024-01-02T00:00:00Z",
      input_tokens_cached: 200,
    });
    const rows = agg([b1, b2]);
    expect(rows[0].cached).toBe(500);
  });

  it("handles uncached_input_tokens and input_tokens_uncached variants", () => {
    const b = bucket({
      bucket_start: "2024-01-01T00:00:00Z",
      uncached_input_tokens: 400,
      input_tokens_uncached: 200,
    });
    const rows = agg([b]);
    expect(rows[0].inp).toBe(600);
  });
});

/* ─── confidenceScore() ─── */

describe("confidenceScore", () => {
  it("returns 0 with no signals", () => {
    expect(confidenceScore([])).toBe(0);
  });

  it("returns 1 when all signals met", () => {
    const signals = [
      { weight: 0.5, met: true },
      { weight: 0.5, met: true },
    ];
    expect(confidenceScore(signals)).toBe(1);
  });

  it("returns 0 when no signals met", () => {
    const signals = [
      { weight: 0.5, met: false },
      { weight: 0.5, met: false },
    ];
    expect(confidenceScore(signals)).toBe(0);
  });

  it("returns weighted proportion", () => {
    const signals = [
      { weight: 0.6, met: true },
      { weight: 0.4, met: false },
    ];
    expect(confidenceScore(signals)).toBeCloseTo(0.6);
  });

  it("handles unequal weights correctly", () => {
    const signals = [
      { weight: 0.3, met: true },
      { weight: 0.25, met: true },
      { weight: 0.2, met: false },
      { weight: 0.15, met: false },
      { weight: 0.1, met: false },
    ];
    const expected = (0.3 + 0.25) / (0.3 + 0.25 + 0.2 + 0.15 + 0.1);
    expect(confidenceScore(signals)).toBeCloseTo(expected);
  });
});

/* ─── analyzeTemporalPattern() ─── */

describe("analyzeTemporalPattern", () => {
  it("returns zero pattern for < 3 days of data", () => {
    const buckets = [
      bucket({ bucket_start: "2024-01-01T00:00:00Z", request_count: 10 }),
      bucket({ bucket_start: "2024-01-02T00:00:00Z", request_count: 5 }),
    ];
    const r = analyzeTemporalPattern(buckets);
    expect(r.batchCandidate).toBe(false);
    expect(r.burstiness).toBe(0);
  });

  it("detects bursty traffic as batch candidate", () => {
    // Very bursty: spikes on 3 of 10 days → cv ≈ 1.53
    const buckets = [
      bucket({ bucket_start: "2024-01-01T00:00:00Z", request_count: 1000 }),
      bucket({ bucket_start: "2024-01-02T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-03T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-04T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-05T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-06T00:00:00Z", request_count: 1000 }),
      bucket({ bucket_start: "2024-01-07T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-08T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-09T00:00:00Z", request_count: 0 }),
      bucket({ bucket_start: "2024-01-10T00:00:00Z", request_count: 1000 }),
    ];
    const r = analyzeTemporalPattern(buckets);
    expect(r.batchCandidate).toBe(true);
    expect(r.burstiness).toBeGreaterThan(1.2);
  });

  it("steady traffic is not a batch candidate", () => {
    const buckets = Array.from({ length: 10 }, (_, i) =>
      bucket({
        bucket_start: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
        request_count: 100,
      })
    );
    const r = analyzeTemporalPattern(buckets);
    expect(r.batchCandidate).toBe(false);
    expect(r.burstiness).toBe(0);
  });

  it("filters by model when provided", () => {
    const buckets = [
      bucket({
        bucket_start: "2024-01-01T00:00:00Z",
        model: "claude-sonnet-4-6",
        request_count: 100,
      }),
      bucket({
        bucket_start: "2024-01-01T00:00:00Z",
        model: "claude-haiku-4-5",
        request_count: 999,
      }),
      bucket({
        bucket_start: "2024-01-02T00:00:00Z",
        model: "claude-sonnet-4-6",
        request_count: 100,
      }),
      bucket({
        bucket_start: "2024-01-02T00:00:00Z",
        model: "claude-haiku-4-5",
        request_count: 999,
      }),
      bucket({
        bucket_start: "2024-01-03T00:00:00Z",
        model: "claude-sonnet-4-6",
        request_count: 100,
      }),
    ];
    const r = analyzeTemporalPattern(buckets, undefined, "claude-sonnet-4-6");
    expect(r.meanDaily).toBeCloseTo(100);
  });
});

/* ─── findIssues() ─── */

describe("findIssues", () => {
  it("returns empty array when no rows", () => {
    expect(findIssues([], [], [])).toEqual([]);
  });

  it("skips rows with zero tokens", () => {
    const rows = agg([
      bucket({ bucket_start: "2024-01-01T00:00:00Z", request_count: 0 }),
    ]);
    expect(findIssues(rows, [], [])).toEqual([]);
  });

  it("detects model downgrade opportunity (Sonnet → Haiku)", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 25 }, (_, i) =>
      sonnetBucket(day(i + 1), 500_000, 60_000, 800)
    );
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    const downgrade = findings.find((f) => f.cat === "Model Downgrade → Haiku");
    expect(downgrade).toBeDefined();
    expect(downgrade!.sav).toBeGreaterThan(0);
  });

  it("detects RAG context bloat (high input:output ratio)", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 20 }, (_, i) =>
      sonnetBucket(day(i + 1), 12_000_000, 200_000, 200)
    );
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    const rag = findings.find((f) => f.cat === "RAG Optimization");
    expect(rag).toBeDefined();
    expect(rag!.ratio).toBeGreaterThan(12);
  });

  it("detects prompt caching miss (low cache rate, high volume)", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 20 }, (_, i) =>
      bucket({
        bucket_start: `${day(i + 1)}T00:00:00Z`,
        model: "claude-sonnet-4-6",
        api_key_id: "key_test",
        workspace_id: "ws_test",
        input_tokens: 3_000_000,
        output_tokens: 200_000,
        request_count: 300,
        cache_read_input_tokens: 0,
      })
    );
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    const caching = findings.find((f) => f.cat === "Prompt Caching");
    expect(caching).toBeDefined();
    expect(caching!.cr).toBeLessThan(0.05);
  });

  it("detects Opus downgrade opportunity (Opus → Sonnet)", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 20 }, (_, i) =>
      opusBucket(day(i + 1), 1_000_000, 300_000, 200)
    );
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    const downgrade = findings.find(
      (f) => f.cat === "Model Downgrade → Sonnet"
    );
    expect(downgrade).toBeDefined();
    expect(downgrade!.sav).toBeGreaterThan(0);
  });

  it("does not emit duplicate categories for the same API key", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    // Two different models under the same API key, both triggering haiku downgrade
    const buckets = [
      ...Array.from({ length: 25 }, (_, i) =>
        bucket({
          bucket_start: `${day(i + 1)}T00:00:00Z`,
          model: "claude-sonnet-4-6",
          api_key_id: "key_shared",
          workspace_id: "ws_test",
          input_tokens: 500_000,
          output_tokens: 60_000,
          request_count: 800,
        })
      ),
      ...Array.from({ length: 25 }, (_, i) =>
        bucket({
          bucket_start: `${day(i + 1)}T00:00:00Z`,
          model: "claude-opus-4-5",
          api_key_id: "key_shared",
          workspace_id: "ws_test",
          input_tokens: 200_000,
          output_tokens: 30_000,
          request_count: 400,
        })
      ),
    ];
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    const haiku = findings.filter((f) => f.cat === "Model Downgrade → Haiku");
    expect(haiku.length).toBeLessThanOrEqual(1);
  });

  it("maps workspace names correctly", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 20 }, (_, i) =>
      sonnetBucket(day(i + 1), 500_000, 60_000, 800)
    ).map((b) => ({ ...b, workspace_id: "ws_abc123" }));
    const rows = agg(buckets);
    const workspaces = [
      {
        id: "ws_abc123",
        name: "production",
        display_name: "Production",
        created_at: "2024-01-01",
      },
    ];
    const findings = findIssues(rows, workspaces, buckets);
    if (findings.length > 0) {
      expect(findings[0].ws).toBe("Production");
    }
  });

  it("savings are positive and less than current cost", () => {
    const day = (n: number) => `2024-01-${String(n).padStart(2, "0")}`;
    const buckets = Array.from({ length: 25 }, (_, i) =>
      sonnetBucket(day(i + 1), 500_000, 60_000, 800)
    );
    const rows = agg(buckets);
    const findings = findIssues(rows, [], buckets);
    for (const f of findings) {
      expect(f.sav).toBeGreaterThanOrEqual(0);
      expect(f.sav).toBeLessThanOrEqual(f.cur + 0.01);
    }
  });
});
