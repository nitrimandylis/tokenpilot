/* ═══════════════════ OFFLINE CONFIDENCE CALIBRATION ═══════════════════ */
/*
 * Measures whether the rule engines' confidence scores mean anything, with
 * no API calls and no ground truth: a finding's confidence should predict
 * how robust it is to noise. The demo generators are pure functions of
 * (month, seed, persona), so the 12 calendar months at the same arc position
 * (monthsAgo 0) are 12 noise-perturbed replicas of the same org. A finding's
 * "persistence" is the share of replicas it appears in.
 *
 * Well calibrated: persistence rises monotonically with the confidence bin,
 * and high-confidence findings (>= 0.65, the UI threshold) rarely flake.
 *
 * Run:   npm run calibrate            (skipped entirely during npm test)
 * Env:   CALIBRATE_SEEDS=200         seeds per persona (default 60)
 */

import { describe, it, expect } from "vitest";
import { demoAnthropic, demoOpenAI, DEMO_SEED } from "@/lib/demo";
import type { DemoPersona } from "@/lib/demo";
import { agg, findIssues } from "@/lib/anthropic/analysis";
import { aggOpenAI, findIssuesOpenAI } from "@/lib/openai/analysis";
import { rowKeyOf } from "@/lib/savingsCap";
import type { Finding } from "@/types";

const YEAR = 2026;
const REPLICAS = 12; // one per calendar month, same arc position
const SEEDS = Number(process.env.CALIBRATE_SEEDS || 60);
const HIGH_CONF = 0.65; // the UI's "high confidence" threshold

function anthropicFindings(
  seed: number,
  persona: DemoPersona,
  month: number
): Finding[] {
  const d = demoAnthropic(YEAR, month, seed, persona, 0);
  const bk = agg(d.bk);
  const bm = agg(d.bm);
  const src = bk.length ? bk : bm;
  const buckets = d.rawBk.length ? d.rawBk : d.rawBm;
  return findIssues(src, d.ws, buckets);
}

function openaiFindings(
  seed: number,
  persona: DemoPersona,
  month: number
): Finding[] {
  const d = demoOpenAI(YEAR, month, seed, persona, 0);
  return findIssuesOpenAI(aggOpenAI(d.usage), d.projects);
}

// One tracked finding identity inside one org (seed): how often it appeared
// across the 12 replicas and at what confidence.
interface Track {
  vendor: string;
  category: string;
  appearances: number;
  confSum: number;
}

function sweepOrg(
  seed: number,
  persona: DemoPersona,
  vendor: "anthropic" | "openai",
  out: Track[]
): void {
  const run = vendor === "anthropic" ? anthropicFindings : openaiFindings;
  const tracks = new Map<string, Track>();

  for (let month = 0; month < REPLICAS; month++) {
    for (const f of run(seed, persona, month)) {
      const key = `${rowKeyOf(f)}|${f.cat}`;
      let t = tracks.get(key);
      if (!t) {
        t = { vendor, category: f.cat as string, appearances: 0, confSum: 0 };
        tracks.set(key, t);
      }
      t.appearances += 1;
      t.confSum += f.conf;
    }
  }

  for (const t of tracks.values()) out.push(t);
}

const meanConf = (t: Track) => t.confSum / t.appearances;
const persistence = (t: Track) => t.appearances / REPLICAS;

const BINS = [
  [0.4, 0.55],
  [0.55, 0.65],
  [0.65, 0.8],
  [0.8, 0.9],
  [0.9, 1.01],
] as const;

function binLabel([lo, hi]: readonly [number, number]): string {
  return `${lo.toFixed(2)}-${Math.min(hi, 1).toFixed(2)}`;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function report(tracks: Track[]): string {
  const lines: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

  for (const vendor of ["anthropic", "openai"]) {
    const vt = tracks.filter((t) => t.vendor === vendor);
    lines.push("");
    lines.push(`── ${vendor} (${vt.length} tracked findings) ──`);
    lines.push("conf bin    n      mean conf  persistence");

    const binPersistence: number[] = [];
    for (const bin of BINS) {
      const inBin = vt.filter(
        (t) => meanConf(t) >= bin[0] && meanConf(t) < bin[1]
      );
      const p = mean(inBin.map(persistence));
      binPersistence.push(inBin.length ? p : NaN);
      lines.push(
        `${binLabel(bin)}   ${String(inBin.length).padStart(5)}  ` +
          `${mean(inBin.map(meanConf)).toFixed(2).padStart(9)}  ${
            inBin.length ? pct(p) : "   —"
          }`
      );
    }

    // Inversions: a higher-confidence bin that persists WORSE than a lower
    // one (ignoring empty bins) means the score is misordered there.
    for (let hi = 1; hi < binPersistence.length; hi++) {
      for (let lo = 0; lo < hi; lo++) {
        const a = binPersistence[lo];
        const b = binPersistence[hi];
        if (!isNaN(a) && !isNaN(b) && b < a - 0.05) {
          lines.push(
            `  ⚠ inversion: bin ${binLabel(BINS[hi])} persists ${pct(b)} < bin ${binLabel(BINS[lo])} at ${pct(a)}`
          );
        }
      }
    }

    // Per-category: where does high confidence flake?
    lines.push("category                          n   mean conf  persistence");
    const byCat = new Map<string, Track[]>();
    for (const t of vt) {
      const arr = byCat.get(t.category) ?? [];
      arr.push(t);
      byCat.set(t.category, arr);
    }
    const rows = [...byCat.entries()].map(([cat, ts]) => ({
      cat,
      n: ts.length,
      conf: mean(ts.map(meanConf)),
      pers: mean(ts.map(persistence)),
    }));
    rows.sort((a, b) => a.pers - b.pers);
    for (const r of rows) {
      // Overconfident: the score promises far more robustness than the
      // finding shows under noise. Underconfidence is fine (conservative).
      const overconfident = r.conf - r.pers > 0.15;
      lines.push(
        `${r.cat.padEnd(32)} ${String(r.n).padStart(4)}   ` +
          `${r.conf.toFixed(2).padStart(9)}  ${pct(r.pers)}` +
          (overconfident
            ? "   ⚠ OVERCONFIDENT — retune this rule's signals"
            : "")
      );
    }
  }

  return lines.join("\n");
}

describe.skipIf(!process.env.CALIBRATE)("confidence calibration sweep", () => {
  it(`sweeps ${SEEDS} seeds × 2 personas × 2 vendors × ${REPLICAS} replicas`, () => {
    const tracks: Track[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const seed = (DEMO_SEED + i * 9973) % 2147483647;
      for (const persona of ["enterprise", "startup"] as DemoPersona[]) {
        sweepOrg(seed, persona, "anthropic", tracks);
        sweepOrg(seed, persona, "openai", tracks);
      }
    }

    const high = tracks.filter((t) => meanConf(t) >= HIGH_CONF);
    const low = tracks.filter((t) => meanConf(t) < HIGH_CONF);
    const highP = mean(high.map(persistence));
    const lowP = mean(low.map(persistence));

    // eslint-disable-next-line no-console
    console.log(
      report(tracks) +
        `\n\nverdict: high-confidence (≥${HIGH_CONF}) persistence ${(highP * 100).toFixed(1)}%` +
        ` vs rest ${(lowP * 100).toFixed(1)}%` +
        (highP < lowP ? "  ⚠ ordering inverted — read the category table" : "")
    );

    // Hard failure only for egregious miscalibration: high-confidence
    // findings flaking outright, or persisting clearly worse than the rest.
    // Small inversions are reported above for a human to judge.
    expect(high.length).toBeGreaterThan(0);
    expect(highP).toBeGreaterThan(0.75);
    if (low.length > 0) {
      expect(highP).toBeGreaterThan(lowP - 0.05);
    }
  });
});
