import { describe, it, expect } from "vitest";
import {
  anthropicToOpenAI,
  compareVendors,
  counterpartModel,
  crossVendorFinding,
  MIN_ORG_SPEND,
  openAIToAnthropic,
} from "@/lib/crossVendor";
import { capRowSavings } from "@/lib/savingsCap";
import { findIssues } from "@/lib/anthropic/analysis";
import { findIssuesOpenAI } from "@/lib/openai/analysis";
import type { OpenAIAggregatedRow } from "@/lib/openai/analysis";
import { tcOpenAI } from "@/lib/openai/pricing";
import { tc } from "@/lib/anthropic/pricing";
import type { AggregatedRow, Finding } from "@/types";
import { AnthropicCategory, OpenAICategory, Severity } from "@/types/analysis";

const XV = "Cross-Vendor Comparison";

const isCrossVendor = (f: Finding) => f.cat === XV;

function anthRow(over: Partial<AggregatedRow> = {}): AggregatedRow {
  return {
    model: "claude-opus-4-6",
    kid: "key_1",
    wid: "ws_1",
    inp: 100e6,
    out: 5e6,
    cached: 0,
    cacheCreated: 0,
    reqs: 5_000,
    activeDays: 25,
    ...over,
  };
}

function oaiRow(over: Partial<OpenAIAggregatedRow> = {}): OpenAIAggregatedRow {
  return {
    model: "gpt-4o",
    project_id: "proj_1",
    line_item: "completions",
    cost: 0,
    inp: 100e6,
    out: 5e6,
    reqs: 5_000,
    activeDays: 25,
    ...over,
  };
}

/* ─── 1. Tier mapping round-trips on current-generation models ─── */

describe("tier mapping", () => {
  it("round-trips current-generation models in both directions", () => {
    // Anthropic → OpenAI → Anthropic
    expect(anthropicToOpenAI("opus-4-6")).toBe("o3");
    expect(openAIToAnthropic("o3")).toBe("opus-4-6");

    expect(anthropicToOpenAI("sonnet-4-6")).toBe("gpt-4o");
    expect(openAIToAnthropic("gpt-4o")).toBe("sonnet-4-6");

    expect(anthropicToOpenAI("haiku-4-5")).toBe("gpt-4o-mini");
    expect(openAIToAnthropic("gpt-4o-mini")).toBe("haiku-4-5");

    // The same three, expressed as a loop over both directions.
    for (const m of ["opus-4-6", "sonnet-4-6", "haiku-4-5"]) {
      expect(openAIToAnthropic(anthropicToOpenAI(m))).toBe(m);
    }
    for (const m of ["o3", "gpt-4o", "gpt-4o-mini"]) {
      expect(anthropicToOpenAI(openAIToAnthropic(m))).toBe(m);
    }
  });

  it("maps the rest of both tables to their capability class", () => {
    // Anthropic → OpenAI, including dated and legacy ids.
    expect(anthropicToOpenAI("claude-opus-4-5-20260101")).toBe("o3");
    expect(anthropicToOpenAI("claude-3-opus")).toBe("o3");
    expect(anthropicToOpenAI("claude-sonnet-3-5")).toBe("gpt-4o");
    expect(anthropicToOpenAI("claude-3-haiku")).toBe("gpt-4o-mini");

    // OpenAI → Anthropic, per the documented mapping.
    expect(openAIToAnthropic("o1")).toBe("opus-4-6");
    expect(openAIToAnthropic("o1-preview")).toBe("opus-4-6");
    expect(openAIToAnthropic("o1-mini")).toBe("sonnet-4-6");
    expect(openAIToAnthropic("o3-mini")).toBe("sonnet-4-6");
    expect(openAIToAnthropic("gpt-4-turbo")).toBe("sonnet-4-6");
    expect(openAIToAnthropic("gpt-4")).toBe("sonnet-4-6");
    expect(openAIToAnthropic("gpt-4-32k")).toBe("sonnet-4-6");
    expect(openAIToAnthropic("gpt-3.5-turbo")).toBe("haiku-4-5");
  });

  it("counterpartModel dispatches on vendor", () => {
    expect(counterpartModel("anthropic", "claude-haiku-4-5")).toBe(
      "gpt-4o-mini"
    );
    expect(counterpartModel("openai", "gpt-4o-mini")).toBe("haiku-4-5");
  });
});

/* ─── 2. The finding never moves report totals ─── */

describe("savings neutrality", () => {
  const savings = (fs: Finding[]) => fs.reduce((s, f) => s + f.sav, 0);
  const highConfSavings = (fs: Finding[]) =>
    fs.filter((f) => f.conf >= 0.65).reduce((s, f) => s + f.sav, 0);

  it("leaves report.savings and highConfSavings identical", () => {
    // An org large enough that the comparison fires alongside real findings.
    const rows = [
      anthRow(),
      anthRow({
        model: "claude-sonnet-4-6",
        kid: "key_2",
        inp: 60e6,
        out: 4e6,
      }),
      anthRow({ model: "claude-haiku-4-5", kid: "key_3", inp: 40e6, out: 2e6 }),
    ];
    const findings = findIssues(rows, [], []);

    expect(findings.some(isCrossVendor)).toBe(true);

    const without = findings.filter((f) => !isCrossVendor(f));
    expect(savings(findings)).toBe(savings(without));
    expect(highConfSavings(findings)).toBe(highConfSavings(without));
  });

  it("is always zero-savings, opt === cur, and INFO", () => {
    const f = crossVendorFinding("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
    ])!;

    expect(f).not.toBeNull();
    expect(f.sav).toBe(0);
    expect(f.opt).toBe(f.cur);
    expect(f.sev).toBe(Severity.INFO);
    expect(f.cat).toBe(AnthropicCategory.CROSS_VENDOR_COMPARISON);
    expect(f.source).toBe("rules");
    expect(f.impact).toContain("not in savings total");
  });

  it("uses the OpenAI category on the OpenAI side", () => {
    const f = crossVendorFinding("openai", [
      { model: "o1", inp: 40e6, out: 2e6 },
    ])!;
    expect(f.cat).toBe(OpenAICategory.CROSS_VENDOR_COMPARISON);
    expect(f.ws).toBe("All projects");
  });
});

/* ─── 3. capRowSavings keeps it (regression on the regex change) ─── */

describe("capRowSavings", () => {
  it("keeps the zero-savings cross-vendor finding", () => {
    const f = crossVendorFinding("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
    ])!;
    expect(capRowSavings([f])).toHaveLength(1);
  });

  it("keeps it alongside cost findings that consume the row headroom", () => {
    const f = crossVendorFinding("openai", [
      { model: "gpt-4o", inp: 100e6, out: 5e6 },
    ])!;
    const rows = findIssuesOpenAI([oaiRow()], []);
    expect(capRowSavings([...rows, f]).some(isCrossVendor)).toBe(true);
  });
});

/* ─── 4. The gate ─── */

describe("gate", () => {
  it("skips orgs under $50/mo", () => {
    // Opus at these volumes lands well under the floor.
    const rows = [{ model: "claude-opus-4-6", inp: 1e6, out: 0.1e6 }];
    expect(compareVendors("anthropic", rows).cur).toBeLessThan(MIN_ORG_SPEND);
    expect(crossVendorFinding("anthropic", rows)).toBeNull();
  });

  it("skips a delta under 10% of org spend", () => {
    // GPT-4 Turbo ($5/$15) vs Sonnet 4.6 ($3/$15): identical output pricing,
    // so an output-heavy workload lands inside the 10% band — "roughly the
    // same", which is noise rather than a finding.
    const rows = [{ model: "gpt-4-turbo", inp: 5e6, out: 10e6 }];
    const c = compareVendors("openai", rows);

    expect(c.cur).toBeGreaterThanOrEqual(MIN_ORG_SPEND);
    expect(Math.abs(c.delta) / c.cur).toBeLessThan(0.1);
    expect(crossVendorFinding("openai", rows)).toBeNull();
  });

  it("fires once a big enough org shows a big enough delta", () => {
    const rows = [{ model: "claude-opus-4-6", inp: 100e6, out: 5e6 }];
    const c = compareVendors("anthropic", rows);

    expect(c.cur).toBeGreaterThanOrEqual(MIN_ORG_SPEND);
    expect(Math.abs(c.delta) / c.cur).toBeGreaterThanOrEqual(0.1);
    expect(crossVendorFinding("anthropic", rows)).not.toBeNull();
  });

  it("emits at most one finding per report", () => {
    const rows = [
      anthRow(),
      anthRow({ model: "claude-sonnet-4-6", kid: "key_2" }),
      anthRow({ model: "claude-haiku-4-5", kid: "key_3" }),
    ];
    expect(findIssues(rows, [], []).filter(isCrossVendor)).toHaveLength(1);
  });
});

/* ─── 5. Both sides priced from the tables, never from r.cost ─── */

describe("table pricing on both sides", () => {
  it("ignores an OpenAI row's billed cost in favour of the table figure", () => {
    // A row whose billed spend is wildly out of line with what the pricing
    // table says those tokens cost. Every other finding trusts r.cost; this
    // one must not, because the Anthropic side has no billed equivalent.
    const inp = 100e6;
    const out = 5e6;
    const table = tcOpenAI("gpt-4o", inp, out);
    const billed = table * 10;

    const withBilled = findIssuesOpenAI(
      [oaiRow({ cost: billed, inp, out })],
      []
    ).find(isCrossVendor)!;
    const withoutBilled = findIssuesOpenAI(
      [oaiRow({ cost: 0, inp, out })],
      []
    ).find(isCrossVendor)!;

    expect(withBilled).toBeDefined();
    expect(withBilled.cur).toBeCloseTo(table, 6);
    expect(withBilled.cur).not.toBeCloseTo(billed, 6);
    // Billed spend changes nothing about the comparison.
    expect(withBilled.cur).toBeCloseTo(withoutBilled.cur, 6);
    expect(withBilled.impact).toBe(withoutBilled.impact);
  });

  it("prices the counterpart side from the other vendor's table", () => {
    const inp = 100e6;
    const out = 5e6;
    const c = compareVendors("anthropic", [
      { model: "claude-opus-4-6", inp, out },
    ]);

    expect(c.cur).toBeCloseTo(tc("opus-4-6", inp, out), 6);
    expect(c.alt).toBeCloseTo(tcOpenAI("o3", inp, out), 6);
    expect(c.delta).toBeCloseTo(c.alt - c.cur, 6);
  });

  it("ignores cached tokens on both sides, matching tc()", () => {
    const bare = compareVendors("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
    ]);
    const cachedHeavy = compareVendors("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6, cached: 400e6 },
    ]);

    expect(cachedHeavy.cur).toBeCloseTo(bare.cur, 6);
    expect(cachedHeavy.alt).toBeCloseTo(bare.alt, 6);
    // Cache reads still inform the confidence signal and the caveat text.
    expect(cachedHeavy.cacheRate).toBeGreaterThan(0.1);
    expect(bare.cacheRate).toBe(0);
  });
});

/* ─── Rollup and narrative ─── */

describe("per-tier rollup", () => {
  const rows = [
    { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
    { model: "claude-sonnet-4-6", inp: 60e6, out: 4e6 },
    { model: "claude-haiku-4-5", inp: 40e6, out: 2e6 },
  ];

  it("groups to one class per capability tier, biggest spend first", () => {
    const c = compareVendors("anthropic", rows);

    expect(c.tiers.map((t) => t.key)).toEqual(["o3", "gpt-4o", "gpt-4o-mini"]);
    expect(c.tiers.map((t) => t.ownLabel)).toEqual([
      "Opus 4.6",
      "Sonnet 4.6",
      "Haiku 4.5",
    ]);
    expect(c.cur).toBeCloseTo(
      c.tiers.reduce((s, t) => s + t.own, 0),
      6
    );
    expect(c.alt).toBeCloseTo(
      c.tiers.reduce((s, t) => s + t.other, 0),
      6
    );
  });

  it("labels each tier line with the counterpart and its delta", () => {
    const f = crossVendorFinding("anthropic", rows)!;

    expect(f.reason).toContain("Opus 4.6");
    expect(f.reason).toContain("Sonnet 4.6");
    expect(f.reason).toMatch(/\([-+]\d+%\)/);
    expect(f.reason.match(/→/g)).toHaveLength(3);
  });

  it("scores the four documented signals", () => {
    // Small org, mixed tiers, no cache: only the direct-match and cache
    // signals are met (0.25 + 0.20 of a 1.00 total).
    const f = crossVendorFinding("anthropic", rows)!;
    const c = compareVendors("anthropic", rows);

    expect(c.directMatchShare).toBe(1);
    expect(f.conf).toBeGreaterThan(0);
    expect(f.conf).toBeLessThanOrEqual(1);
  });

  it("drops the direct-match share when models fall through to the default", () => {
    const c = compareVendors("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
      { model: "some-unreleased-opus", inp: 100e6, out: 5e6 },
    ]);
    expect(c.directMatchShare).toBeGreaterThan(0);
    expect(c.directMatchShare).toBeLessThan(1);
  });
});

describe("action caveats", () => {
  it("always names the repricing and migration-cost caveats", () => {
    const f = crossVendorFinding("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6 },
    ])!;

    expect(f.action).toContain("not a quality claim");
    expect(f.action).toContain("Migration cost is excluded");
    expect(f.action).not.toContain("90% off");
  });

  it("adds the cache-discount caveat once the org cache rate reaches 10%", () => {
    const f = crossVendorFinding("anthropic", [
      { model: "claude-opus-4-6", inp: 100e6, out: 5e6, cached: 400e6 },
    ])!;

    expect(f.action).toContain("90% off");
    expect(f.action).toContain("50% off");
  });
});
