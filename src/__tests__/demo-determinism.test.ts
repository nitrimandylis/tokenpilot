import { describe, it, expect } from "vitest";
import {
  demoAnthropic,
  demoOpenAI,
  DEMO_SEED,
  type DemoPersona,
} from "@/lib/demo";
import { agg, findIssues } from "@/lib/anthropic/analysis";
import { aggOpenAI, findIssuesOpenAI } from "@/lib/openai/analysis";
import { tc } from "@/lib/anthropic/pricing";
import { tcOpenAI } from "@/lib/openai/pricing";

// Fixed base period so the test itself is clock-independent. Mirrors
// startDemo's loop: the base month plus the 5 months before it, oldest
// first, with monthsAgo counting down to 0 at the base month.
const BASE_YEAR = 2026;
const BASE_MONTH = 6; // July (0-indexed)

// Two arbitrary but fixed seeds — the generators must behave for any seed,
// these just make the assertions reproducible.
const SEED_A = 1234567;
const SEED_B = 89101112;

function demoMonths(): { y: number; m: number; monthsAgo: number }[] {
  const out: { y: number; m: number; monthsAgo: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let m = BASE_MONTH - i;
    let y = BASE_YEAR;
    while (m < 0) {
      m += 12;
      y--;
    }
    out.push({ y, m, monthsAgo: i });
  }
  return out;
}

// Same report-building pipeline startDemo runs per month (rule engine path).
function runAnthropicDemo(seed: number, persona: DemoPersona) {
  return demoMonths().map(({ y, m, monthsAgo }) => {
    const d = demoAnthropic(y, m, seed, persona, monthsAgo);
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
      cacheWrites: d.bw.reduce(
        (s, b) => s + (b.cache_creation_input_tokens || 0),
        0
      ),
    };
  });
}

function runOpenAIDemo(seed: number, persona: DemoPersona) {
  return demoMonths().map(({ y, m, monthsAgo }) => {
    const d = demoOpenAI(y, m, seed, persona, monthsAgo);
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

describe("demo purity and determinism", () => {
  const personas: DemoPersona[] = ["enterprise", "startup"];

  it("two calls with identical (year, month, seed, persona, monthsAgo) are byte-identical", () => {
    for (const persona of personas) {
      expect(
        JSON.stringify(demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_A, persona, 2))
      ).toBe(
        JSON.stringify(demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_A, persona, 2))
      );
      expect(
        JSON.stringify(demoOpenAI(BASE_YEAR, BASE_MONTH, SEED_A, persona, 2))
      ).toBe(
        JSON.stringify(demoOpenAI(BASE_YEAR, BASE_MONTH, SEED_A, persona, 2))
      );
    }
  });

  it("two runs of the full 6-month demo produce byte-identical reports (both vendors)", () => {
    expect(JSON.stringify(runAnthropicDemo(DEMO_SEED, "enterprise"))).toBe(
      JSON.stringify(runAnthropicDemo(DEMO_SEED, "enterprise"))
    );
    expect(JSON.stringify(runOpenAIDemo(DEMO_SEED, "enterprise"))).toBe(
      JSON.stringify(runOpenAIDemo(DEMO_SEED, "enterprise"))
    );
  });

  it("a different seed produces a different org with different data", () => {
    const a = demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_A);
    const b = demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_B);
    expect(JSON.stringify(a.bm)).not.toBe(JSON.stringify(b.bm));
    expect(a.org.name).not.toBe(b.org.name);
    expect(a.org.id).not.toBe(b.org.id);

    const oa = demoOpenAI(BASE_YEAR, BASE_MONTH, SEED_A);
    const ob = demoOpenAI(BASE_YEAR, BASE_MONTH, SEED_B);
    expect(JSON.stringify(oa.usage)).not.toBe(JSON.stringify(ob.usage));
    expect(oa.org.name).not.toBe(ob.org.name);
  });

  it("all 6 months of a run come from the same org (both personas)", () => {
    for (const persona of personas) {
      const anth = runAnthropicDemo(SEED_A, persona);
      expect(new Set(anth.map((r) => r.org.name)).size).toBe(1);
      const oai = runOpenAIDemo(SEED_A, persona);
      expect(new Set(oai.map((r) => r.org.name)).size).toBe(1);
    }
  });
});

describe("enterprise persona", () => {
  it("has 8 workspaces plus busy default-workspace traffic", () => {
    const d = demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_A, "enterprise", 0);
    expect(d.ws).toHaveLength(8);
    // Some traffic deliberately carries no workspace_id → default workspace.
    expect(d.bw.some((b) => !b.workspace_id)).toBe(true);
    expect(d.bw.some((b) => b.workspace_id === "ws_prod")).toBe(true);
  });

  it("fires at least 6 distinct Anthropic categories in the current month", () => {
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const [current] = runAnthropicDemo(seed, "enterprise").slice(-1);
      const cats = new Set(current.findings.map((f) => f.cat as string));
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
      expect(cats.size).toBeGreaterThanOrEqual(6);
    }
  });

  it("fires at least 6 distinct OpenAI categories in the current month", () => {
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const [current] = runOpenAIDemo(seed, "enterprise").slice(-1);
      const cats = new Set(current.findings.map((f) => f.cat as string));
      for (const expected of [
        "Model Downgrade → GPT-4o-mini",
        "RAG Optimization",
        "Prompt Caching",
        "Batch API Migration",
        "Reasoning Model Overkill",
        "Model Upgrade",
        "Prompt Optimization",
        "High-Impact Opportunity",
      ]) {
        expect(cats, `expected category "${expected}" to fire`).toContain(
          expected
        );
      }
      expect(cats.size).toBeGreaterThanOrEqual(6);
    }
  });

  it("6-month spend is strictly increasing, except around the incident month", () => {
    // monthsAgo 2 → index 3 in the oldest-first array. The incident bumps
    // that month's spend, so the following month may legitimately dip.
    const incidentIdx = 3;
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const months = runAnthropicDemo(seed, "enterprise");
      for (let i = 0; i < months.length - 1; i++) {
        if (i === incidentIdx) continue;
        expect(
          months[i + 1].spend,
          `seed ${seed}: spend should grow from month ${i} to ${i + 1}`
        ).toBeGreaterThan(months[i].spend);
      }
      // The incident month itself must sit visibly above the prior month.
      expect(months[incidentIdx].spend).toBeGreaterThan(
        months[incidentIdx - 1].spend * 1.1
      );
    }
  });

  it("the incident month's cache-write volume spikes vs its neighbors", () => {
    const incidentIdx = 3;
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const months = runAnthropicDemo(seed, "enterprise");
      const spike = months[incidentIdx].cacheWrites;
      expect(spike).toBeGreaterThan(months[incidentIdx - 1].cacheWrites * 2.5);
      expect(spike).toBeGreaterThan(months[incidentIdx + 1].cacheWrites * 2.5);
    }
  });
});

describe("startup persona", () => {
  it("produces at most 3 findings per vendor, with modest savings", () => {
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const [anth] = runAnthropicDemo(seed, "startup").slice(-1);
      expect(anth.findings.length).toBeGreaterThanOrEqual(1);
      expect(anth.findings.length).toBeLessThanOrEqual(3);
      expect(anth.savings).toBeLessThan(anth.spend * 0.3);

      const [oai] = runOpenAIDemo(seed, "startup").slice(-1);
      expect(oai.findings.length).toBeGreaterThanOrEqual(1);
      expect(oai.findings.length).toBeLessThanOrEqual(3);
      expect(oai.savings).toBeLessThan(oai.spend * 0.3);
    }
  });

  it("is a small org: 3 Anthropic workspaces, 2 OpenAI projects", () => {
    const d = demoAnthropic(BASE_YEAR, BASE_MONTH, SEED_A, "startup", 0);
    expect(d.ws).toHaveLength(3);
    // All startup traffic is properly workspace-tagged — no default-workspace
    // mess, so no workspace-organization finding.
    expect(d.bw.every((b) => !!b.workspace_id)).toBe(true);

    const o = demoOpenAI(BASE_YEAR, BASE_MONTH, SEED_A, "startup", 0);
    expect(o.projects).toHaveLength(2);
  });

  it("keeps the startup's findings minor — no critical severity", () => {
    for (const seed of [SEED_A, SEED_B, DEMO_SEED]) {
      const [anth] = runAnthropicDemo(seed, "startup").slice(-1);
      const [oai] = runOpenAIDemo(seed, "startup").slice(-1);
      for (const f of [...anth.findings, ...oai.findings]) {
        expect(f.sev).not.toBe("critical");
      }
    }
  });
});
