/* ═══════════════════ PER-ROW SAVINGS CAP ═══════════════════ */
/*
 * A row (one model under one key in one workspace) can attract several
 * findings — caching, batch, a downgrade — whose savings each honestly stay
 * under the row's monthly cost but whose SUM does not. A report must never
 * claim a row can save more than it spends, so every engine output passes
 * through this cap: rule-only reports, LLM pricing, and the consensus merge.
 */

import type { Finding } from "@/types";

// Categories where a zero-savings finding is still worth surfacing (quality
// or organizational wins). Everything else exists to save money, so a finding
// the cap zeroes out is noise and gets dropped.
export const KEEP_ZERO_SAVINGS =
  /upgrade|organization|workspace|project|quality/i;

const slug = (c: string) => c.replace(/[^a-z0-9]/gi, "-").toLowerCase();

/**
 * The row identity a finding belongs to. Finding ids share the shape
 * `${rowId}-${categorySlug}`, so stripping the category slug recovers the
 * row id. Org-level findings (workspace/project organization) collapse to a
 * shared "org" row.
 */
export function rowKeyOf(f: Finding): string {
  if (/organization/i.test(f.cat as string)) return "org";
  const suffix = `-${slug(f.cat as string)}`;
  return f.id.endsWith(suffix) ? f.id.slice(0, -suffix.length) : f.id;
}

/**
 * Cap cumulative savings per row at the row's monthly spend, greedy by
 * savings: the biggest finding keeps its true number, later ones take what
 * headroom is left. Cost findings the cap zeroes out are dropped;
 * zero-savings quality/org findings always survive. Ordering is preserved.
 */
export function capRowSavings(findings: Finding[]): Finding[] {
  const headroom = new Map<string, number>();

  for (const f of [...findings].sort((a, b) => b.sav - a.sav)) {
    const key = rowKeyOf(f);
    const left = headroom.get(key) ?? f.cur;
    const sav = Math.min(f.sav, Math.max(0, left));
    headroom.set(key, left - sav);
    if (sav !== f.sav) {
      f.sav = sav;
      f.opt = Math.max(0, f.cur - sav);
      const pct = f.cur > 0 ? Math.round((sav / f.cur) * 100) : 0;
      f.impact =
        sav > 0 ? `$${sav.toFixed(2)}/mo (${pct}%)` : "Quality improvement";
    }
  }

  return findings.filter(
    (f) => f.sav > 0 || KEEP_ZERO_SAVINGS.test(f.cat as string)
  );
}
