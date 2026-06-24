/* Vendor row → neutral UsageSummary for LLM-guided analysis. */

import type { AggregatedRow, UsageBucket, Workspace } from "@/types";
import { pr, tc } from "@/lib/anthropic/pricing";
import { analyzeTemporalPattern } from "@/lib/anthropic/analysis";
import { prOpenAI, tcOpenAI } from "@/lib/openai/pricing";
import type { OpenAIAggregatedRow } from "@/lib/openai/analysis";
import type { UsageSummary } from "./analysis";

export function toSummariesAnthropic(
  rows: AggregatedRow[],
  workspaces: Workspace[],
  buckets: UsageBucket[]
): UsageSummary[] {
  const wn: Record<string, string> = {};
  (workspaces || []).forEach((w) => {
    wn[w.id] = w.display_name || w.name || w.id;
  });

  return rows.map((r) => {
    const p = pr(r.model);
    return {
      id: `${r.kid || r.model}-${r.wid || "x"}`,
      name: r.kid || r.model,
      ws: r.wid ? wn[r.wid] || r.wid : "Default workspace",
      model: r.model,
      ml: p.l,
      inp: r.inp,
      out: r.out,
      cached: r.cached,
      cacheCreated: r.cacheCreated,
      reqs: r.reqs,
      activeDays: r.activeDays,
      cur: tc(r.model, r.inp, r.out),
      temporal: analyzeTemporalPattern(buckets || [], r.kid, r.model),
    };
  });
}

export function toSummariesOpenAI(
  rows: OpenAIAggregatedRow[],
  projects: { id: string; name?: string }[]
): UsageSummary[] {
  const pn: Record<string, string> = {};
  (projects || []).forEach((p) => {
    pn[p.id] = p.name || p.id;
  });

  return rows.map((r) => {
    const p = prOpenAI(r.model || r.line_item || "");
    const cur = r.cost > 0 ? r.cost : tcOpenAI(r.model, r.inp, r.out);
    return {
      id: `${r.project_id || "default"}-${r.model || r.line_item || "?"}`,
      name: r.model || r.line_item || "?",
      ws: r.project_id ? pn[r.project_id] || r.project_id : "Default project",
      model: r.model || r.line_item || "?",
      ml: p.l,
      inp: r.inp,
      out: r.out,
      cached: 0,
      cacheCreated: 0,
      reqs: r.reqs,
      activeDays: r.activeDays,
      cur,
    };
  });
}
