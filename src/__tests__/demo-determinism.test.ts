import { describe, it, expect } from "vitest";
import { demoAnthropic, demoOpenAI, DEMO_SEED } from "@/lib/demo";
import { agg, findIssues } from "@/lib/anthropic/analysis";
import { aggOpenAI, findIssuesOpenAI } from "@/lib/openai/analysis";
import { tc } from "@/lib/anthropic/pricing";
import { tcOpenAI } from "@/lib/openai/pricing";

// Fixed base period so the test itself is clock-independent. Mirrors
// startDemo's loop: the base month plus the 5 months before it.
const BASE_YEAR = 2026;
const BASE_MONTH = 6; // July (0-indexed)

function demoMonths(): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let m = BASE_MONTH - i;
    let y = BASE_YEAR;
    while (m < 0) {
      m += 12;
      y--;
    }
    out.push({ y, m });
  }
  return out;
}

// Same report-building pipeline startDemo runs per month (rule engine path).
function runAnthropicDemo() {
  return demoMonths().map(({ y, m }) => {
    const d = demoAnthropic(y, m, DEMO_SEED);
    const bk = agg(d.bk);
    const bm = agg(d.bm);
    const src = bk.length ? bk : bm;
    const buckets = d.rawBk.length ? d.rawBk : d.rawBm;

    let spend = 0,
      ti = 0,
      to = 0;
    for (const a of bm.length ? bm : src) {
      spend += tc(a.model, a.inp, a.out);
      ti += a.inp;
      to += a.out;
    }

    const findings = findIssues(src, d.ws, buckets);
    return {
      org: d.org,
      spend,
      savings: findings.reduce((s, f) => s + f.sav, 0),
      tokens: ti + to,
      findings,
    };
  });
}

function runOpenAIDemo() {
  return demoMonths().map(({ y, m }) => {
    const d = demoOpenAI(y, m, DEMO_SEED);
    const rows = aggOpenAI(d.usage);

    let spend = 0;
    if (d.costs && d.costs.data.length > 0) {
      for (const bucket of d.costs.data) {
        for (const result of bucket.results) {
          spend += result.amount.value;
        }
      }
    } else {
      for (const row of rows) {
        spend += tcOpenAI(row.model, row.inp, row.out);
      }
    }

    const findings = findIssuesOpenAI(rows, d.projects);
    return {
      org: d.org,
      spend,
      savings: findings.reduce((s, f) => s + f.sav, 0),
      findings,
    };
  });
}

describe("demo mode determinism", () => {
  it("two runs of the full 6-month Anthropic demo produce byte-identical reports", () => {
    expect(JSON.stringify(runAnthropicDemo())).toBe(
      JSON.stringify(runAnthropicDemo())
    );
  });

  it("two runs of the full 6-month OpenAI demo produce byte-identical reports", () => {
    expect(JSON.stringify(runOpenAIDemo())).toBe(
      JSON.stringify(runOpenAIDemo())
    );
  });

  it("all 6 months of a run come from the same org", () => {
    const anth = runAnthropicDemo();
    expect(new Set(anth.map((r) => r.org.name)).size).toBe(1);
    const oai = runOpenAIDemo();
    expect(new Set(oai.map((r) => r.org.name)).size).toBe(1);
  });

  it("a different seed produces different data", () => {
    const a = demoAnthropic(BASE_YEAR, BASE_MONTH, DEMO_SEED);
    const b = demoAnthropic(BASE_YEAR, BASE_MONTH, DEMO_SEED + 1);
    expect(JSON.stringify(a.bm)).not.toBe(JSON.stringify(b.bm));
  });

  it("the demo org has 8 workspaces plus busy default-workspace traffic", () => {
    const d = demoAnthropic(BASE_YEAR, BASE_MONTH, DEMO_SEED);
    expect(d.ws).toHaveLength(8);
    // Some traffic deliberately carries no workspace_id → default workspace.
    expect(d.bw.some((b) => !b.workspace_id)).toBe(true);
    expect(d.bw.some((b) => b.workspace_id === "ws_prod")).toBe(true);
  });

  it("the demo's varied workloads fire most rule categories", () => {
    const cats = new Set(
      runAnthropicDemo().flatMap((r) => r.findings.map((f) => f.cat as string))
    );
    for (const expected of [
      "Model Downgrade → Haiku",
      "Model Downgrade → Sonnet",
      "RAG Optimization",
      "Prompt Caching",
      "Batch API Migration",
      "Model Upgrade",
      "Workspace Organization",
    ]) {
      expect(cats, `expected category "${expected}" to fire`).toContain(
        expected
      );
    }
  });
});
