"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import Stat from "@/components/Stat";
import Row from "@/components/Row";
import VendorBadge from "@/components/VendorBadge";
import MonthPicker from "@/components/MonthPicker";
import { $, T, P } from "@/lib/formatters";
import { storage, Vendor } from "@/lib/storage";
import type { Report } from "@/types";
import { useApiKey } from "@/contexts/ApiKeyContext";

type FilterType = "all" | "critical" | "warning" | "info";

function RecommendationsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { getKey } = useApiKey();

  const [filter, setFilter] = useState<FilterType>("all");
  const [oid, setOid] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [analysisRecord, setAnalysisRecord] = useState(() =>
    storage.getAnalysis(id)
  );

  // Reload analysis from storage when id changes
  useEffect(() => {
    const record = storage.getAnalysis(id);
    setAnalysisRecord(record);
  }, [id]);

  // Get year/month from URL params, fallback to first available month
  const urlYear = parseInt(searchParams.get("year") || "");
  const urlMonth = parseInt(searchParams.get("month") || "");

  // Determine which year/month to display
  const firstMonthKey = analysisRecord
    ? Object.keys(analysisRecord.months).sort()[0]
    : null;
  const [defaultYear, defaultMonth] = firstMonthKey
    ? firstMonthKey.split("-").map(Number)
    : [new Date().getFullYear(), new Date().getMonth()];

  const year = urlYear || defaultYear;
  const month = urlMonth >= 0 ? urlMonth : defaultMonth;

  // Get month data for current year/month
  const monthData = analysisRecord
    ? storage.getMonthData(id, year, month)
    : null;

  const r = monthData?.report;

  // Filtered recommendations - must be called before any returns
  const filteredRecommendations = useMemo(() => {
    if (!r) return [];
    if (filter === "all") {
      return r.findings;
    }
    return r.findings.filter((f) => f.sev === filter);
  }, [r, filter]);

  // Redirect if no analysis found
  useEffect(() => {
    if (!analysisRecord) {
      router.push("/");
    }
  }, [analysisRecord, router]);

  // Fetch data if month not cached or forceRefresh is triggered
  useEffect(() => {
    if (!analysisRecord || isFetching) return;

    // If forceRefresh is true, clear the cache for this month
    if (forceRefresh) {
      console.log(`[Refresh] Clearing cached data for ${year}-${month}`);
      storage.clearMonthData(id, year, month);
      setForceRefresh(false);
      // After clearing, the next check will see no data and fetch
    }

    const hasData = storage.hasMonthData(id, year, month);
    console.log(`[Refresh] hasData for ${year}-${month}:`, hasData);

    if (!hasData) {
      // Try to fetch this month's data
      const apiKey = getKey(analysisRecord.vendor);

      console.log(
        `Month ${year}-${month} not cached for ${analysisRecord.vendor}. API key available:`,
        !!apiKey
      );

      if (!apiKey) {
        // No API key in sessionStorage - show error
        setFetchError(
          `Data for ${year}-${String(month + 1).padStart(2, "0")} hasn't been fetched yet. Please go to home and run a new analysis to cache the API key in this session.`
        );
        return;
      }

      // We have an API key - fetch the data
      console.log(`Fetching ${year}-${month} for ${analysisRecord.vendor}...`);
      setIsFetching(true);
      setFetchError(null);

      const fetchData = async () => {
        try {
          if (analysisRecord.vendor === Vendor.ANTHROPIC) {
            const { pull } = await import("@/lib/anthropic/api");
            const { agg, findIssues } =
              await import("@/lib/anthropic/analysis");
            const { tc } = await import("@/lib/anthropic/pricing");
            const { Severity } = await import("@/types");

            const d = await pull(apiKey, () => {}, year, month);
            const bk = agg(d.bk);
            const bm = agg(d.bm);
            const src = bk.length ? bk : bm;
            const findings = findIssues(
              src,
              d.ws,
              d.rawBk.length ? d.rawBk : d.rawBm
            );

            let spend = 0;
            let ti = 0;
            let to = 0;
            for (const a of bm.length ? bm : src) {
              spend += tc(a.model, a.inp, a.out);
              ti += a.inp;
              to += a.out;
            }

            const wb = agg(d.bw);
            const wa: Record<string, { id: string; spend: number }> = {};
            const wn: Record<string, string> = {};

            wa["default"] = { id: "default", spend: 0 };
            wn["default"] = "default";

            (d.ws || []).forEach((w) => {
              wa[w.id] = { id: w.id, spend: 0 };
              wn[w.id] = w.display_name || w.name || w.id;
            });

            for (const w of wb) {
              const wid = w.wid || "default";
              if (!wa[wid]) {
                wa[wid] = { id: wid, spend: 0 };
                wn[wid] = wid;
              }
              wa[wid].spend += tc(w.model, w.inp, w.out);
            }

            const wss = Object.values(wa)
              .map((w) => ({ ...w, name: wn[w.id] || w.id }))
              .sort((a, b) => b.spend - a.spend)
              .slice(0, 10);

            const report = {
              org: d.org,
              spend,
              savings: findings.reduce((s, f) => s + f.sav, 0),
              tokens: ti + to,
              findings,
              wss,
              keys:
                new Set(src.map((s) => s.kid).filter(Boolean)).size ||
                src.length,
              wc: d.ws?.length || wss.length || 1,
              critCount: findings.filter((f) => f.sev === Severity.CRITICAL)
                .length,
              warnCount: findings.filter((f) => f.sev === Severity.WARNING)
                .length,
              infoCount: findings.filter((f) => f.sev === Severity.INFO).length,
              highConfSavings: findings
                .filter((f) => f.conf >= 0.65)
                .reduce((s, f) => s + f.sav, 0),
            };

            storage.saveAnalysis(
              id,
              analysisRecord.vendor,
              year,
              month,
              d.org.name || "Organization",
              d.org.id,
              report,
              d.raw
            );
            // Reload from storage to get updated org name/id
            setAnalysisRecord(storage.getAnalysis(id));
            setIsFetching(false);
            router.refresh();
          } else {
            // OpenAI
            const { pull } = await import("@/lib/openai/api");
            const { aggOpenAI, aggOpenAICosts, findIssuesOpenAI } =
              await import("@/lib/openai/analysis");
            const { tcOpenAI } = await import("@/lib/openai/pricing");
            const { Severity } = await import("@/types");

            const d = await pull(apiKey, () => {}, year, month);

            // Prefer usage API (has model details), fallback to costs API
            const rows =
              d.usage && d.usage.data && d.usage.data.length > 0
                ? aggOpenAI(d.usage)
                : d.costs && d.costs.data && d.costs.data.length > 0
                  ? aggOpenAICosts(d.costs)
                  : [];

            const findings = findIssuesOpenAI(rows, d.projects);

            // Use actual costs from Costs API if available
            let spend = 0;
            if (d.costs && d.costs.data.length > 0) {
              for (const bucket of d.costs.data) {
                for (const result of bucket.results) {
                  spend += result.amount.value;
                }
              }
            } else {
              for (const row of rows) {
                // Use pre-calculated cost if available (e.g., Whisper), otherwise calculate from tokens
                spend +=
                  row.cost > 0
                    ? row.cost
                    : tcOpenAI(row.model, row.inp, row.out);
              }
            }

            let ti = 0;
            let to = 0;
            for (const row of rows) {
              ti += row.inp;
              to += row.out;
            }

            const projectSpend: Record<string, { id: string; spend: number }> =
              {};
            const projectNames: Record<string, string> = {};

            (d.projects || []).forEach((p) => {
              projectSpend[p.id] = { id: p.id, spend: 0 };
              projectNames[p.id] = p.name || p.id;
            });

            // Prefer usage data for project spend (has correct project IDs)
            // Only use costs API as fallback (it has a bug attributing everything to Default Project)
            if (rows.length > 0) {
              // Calculate from usage (has correct project_id)
              for (const row of rows) {
                const pid = row.project_id || "default";
                if (!projectSpend[pid]) {
                  projectSpend[pid] = { id: pid, spend: 0 };
                  projectNames[pid] = pid;
                }
                // Use pre-calculated cost if available (e.g., Whisper), otherwise calculate from tokens
                const rowCost =
                  row.cost > 0
                    ? row.cost
                    : tcOpenAI(row.model, row.inp, row.out);
                projectSpend[pid].spend += rowCost;
              }
            } else if (d.costs && d.costs.data.length > 0) {
              // Fallback: Use actual costs from Costs API (note: may have incorrect project attribution)
              for (const bucket of d.costs.data) {
                for (const result of bucket.results) {
                  const pid = result.project_id || "default";
                  if (!projectSpend[pid]) {
                    projectSpend[pid] = { id: pid, spend: 0 };
                    projectNames[pid] = result.project_name || pid;
                  }
                  projectSpend[pid].spend += result.amount.value;
                  // Update name if available and not already set
                  if (result.project_name && !projectNames[pid]) {
                    projectNames[pid] = result.project_name;
                  }
                }
              }
            }

            console.log(
              "[Analysis Page] Project spend before mapping:",
              projectSpend
            );
            console.log("[Analysis Page] Project names:", projectNames);

            const wss = Object.values(projectSpend)
              .map((p) => ({ ...p, name: projectNames[p.id] || p.id }))
              .sort((a, b) => b.spend - a.spend)
              .slice(0, 10);

            console.log("[Analysis Page] Final wss:", wss);

            // Calculate total spend from project spend to ensure they match
            // This avoids discrepancies between Costs API and Usage API
            const totalSpendFromProjects = Object.values(projectSpend).reduce(
              (sum, p) => sum + p.spend,
              0
            );
            spend = totalSpendFromProjects;

            // Calculate non-overlapping savings (max per model to avoid double-counting)
            const savingsByModel: Record<string, number> = {};
            const highConfSavingsByModel: Record<string, number> = {};

            for (const f of findings) {
              const modelKey = `${f.model}-${f.ws || f.name}`;
              savingsByModel[modelKey] = Math.max(
                savingsByModel[modelKey] || 0,
                f.sav
              );
              if (f.conf >= 0.65) {
                highConfSavingsByModel[modelKey] = Math.max(
                  highConfSavingsByModel[modelKey] || 0,
                  f.sav
                );
              }
            }

            const totalSavings = Object.values(savingsByModel).reduce(
              (sum, s) => sum + s,
              0
            );
            const totalHighConfSavings = Object.values(
              highConfSavingsByModel
            ).reduce((sum, s) => sum + s, 0);

            // Count unique API keys from raw usage data
            const uniqueApiKeys =
              d.usage && d.usage.data
                ? new Set(d.usage.data.map((u) => u.api_key_id).filter(Boolean))
                    .size
                : 0;

            const report = {
              org: d.org,
              spend,
              savings: totalSavings,
              tokens: ti + to,
              findings,
              wss,
              keys: uniqueApiKeys || rows.length,
              wc: d.projects?.length || wss.length || 1,
              critCount: findings.filter((f) => f.sev === Severity.CRITICAL)
                .length,
              warnCount: findings.filter((f) => f.sev === Severity.WARNING)
                .length,
              infoCount: findings.filter((f) => f.sev === Severity.INFO).length,
              highConfSavings: totalHighConfSavings,
            };

            storage.saveAnalysis(
              id,
              analysisRecord.vendor,
              year,
              month,
              d.org.name || "Organization",
              d.org.id || "",
              report,
              { ...d.raw, usage: d.usage }
            );
            // Reload from storage to get updated org name/id
            setAnalysisRecord(storage.getAnalysis(id));
            setIsFetching(false);
            router.refresh();
          }
        } catch (error: any) {
          setFetchError(error.message || "Failed to fetch data");
          setIsFetching(false);
        }
      };

      fetchData();
    } else {
      // Clear any previous error
      setFetchError(null);
    }
  }, [
    analysisRecord,
    id,
    year,
    month,
    isFetching,
    forceRefresh,
    getKey,
    router,
  ]);

  if (!analysisRecord) {
    return null;
  }

  if (isFetching) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="relative mb-8">
          {/* Background illustration */}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-32 h-32 text-slate-800/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          {/* Spinner */}
          <div className="relative w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
        </div>
        <p className="text-base text-slate-300 font-semibold mb-2">
          Analyzing {monthNames[month]} {year}
        </p>
        <p className="text-xs text-slate-500">
          Fetching usage data and running optimization analysis...
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
        <p className="text-sm text-red-400">{fetchError}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← Back to home
        </Link>
      </div>
    );
  }

  if (!monthData || !r) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <p className="text-sm text-slate-400">
          No data for {year}-{String(month + 1).padStart(2, "0")}
        </p>
      </div>
    );
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const mxW = r ? Math.max(...r.wss.map((w) => w.spend), 1) : 1;
  const wColors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-orange-500",
  ];

  return (
    <div className="space-y-8">
      {/* Header with Vendor/Org and Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <VendorBadge vendor={analysisRecord.vendor} size="small" />
          <span className="text-sm text-slate-300 font-medium">
            {analysisRecord.orgName}
          </span>
        </div>
        <button
          onClick={() => setForceRefresh(true)}
          disabled={isFetching}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            isFetching
              ? "text-slate-600 cursor-not-allowed"
              : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
          }`}
          title="Refresh data from API"
        >
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-800">
        <Link
          href={`/history/${id}/recommendations?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-emerald-500 text-slate-200"
        >
          Recommendations
        </Link>
        <Link
          href={`/history/${id}/analytics?year=${year}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-slate-500 hover:text-slate-400"
        >
          Analytics
        </Link>
        <Link
          href={`/history/${id}/raw-data?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-slate-500 hover:text-slate-400"
        >
          Raw API Data
        </Link>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          Monthly Analysis
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const newMonth = month === 0 ? 11 : month - 1;
              const newYear = month === 0 ? year - 1 : year;
              router.push(
                `/history/${id}/recommendations?year=${newYear}&month=${newMonth}`
              );
            }}
            className="p-1.5 text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors rounded hover:bg-slate-800/50"
            title="Previous month"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <button
            onClick={() => setShowMonthPicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-200 cursor-pointer rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Select month"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {monthNames[month]} {year}
          </button>

          <button
            onClick={() => {
              const now = new Date();
              const isCurrentMonth =
                year === now.getFullYear() && month === now.getMonth();
              if (isCurrentMonth) return;

              const newMonth = month === 11 ? 0 : month + 1;
              const newYear = month === 11 ? year + 1 : year;
              router.push(
                `/history/${id}/recommendations?year=${newYear}&month=${newMonth}`
              );
            }}
            disabled={
              year === new Date().getFullYear() &&
              month === new Date().getMonth()
            }
            className={`p-1.5 transition-colors rounded hover:bg-slate-800/50 ${
              year === new Date().getFullYear() &&
              month === new Date().getMonth()
                ? "text-slate-700 cursor-not-allowed"
                : "text-slate-500 hover:text-emerald-400 cursor-pointer"
            }`}
            title="Next month"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          {(year !== new Date().getFullYear() ||
            month !== new Date().getMonth()) && (
            <div className="w-px h-4 bg-slate-700 mx-1" />
          )}

          {(year !== new Date().getFullYear() ||
            month !== new Date().getMonth()) && (
            <button
              onClick={() => {
                const now = new Date();
                router.push(
                  `/history/${id}/recommendations?year=${now.getFullYear()}&month=${now.getMonth()}`
                );
              }}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 cursor-pointer transition-colors"
            >
              Jump to Current
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap justify-between gap-y-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <Stat
          label="Monthly Spend"
          value={$(r.spend)}
          sub={
            analysisRecord.vendor === Vendor.ANTHROPIC
              ? `${r.keys} keys · ${r.wc} workspaces`
              : `${r.wc} projects`
          }
        />
        <Stat
          label="Recoverable"
          value={$(r.savings)}
          sub={r.spend > 0 ? `${P(r.savings, r.spend)}% of spend` : ""}
          g
        />
        <Stat
          label="Recommendations"
          value={r.findings.length}
          sub={`${r.critCount} critical · ${r.warnCount} warning`}
          y={r.findings.length > 0}
        />
        <Stat label="Tokens / 30d" value={T(r.tokens)} />
      </div>

      {/* Recommendations */}
      {r.findings.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-300">
              Optimization Recommendations{" "}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {filteredRecommendations.length} shown · {$(r.savings)}/mo total
              </span>
            </h2>
            <div className="flex gap-1">
              {[
                ["all", "All"],
                ["critical", "Critical"],
                ["warning", "Warning"],
                ["info", "Info"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k as FilterType)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    filter === k
                      ? "bg-slate-700 text-slate-200"
                      : "text-slate-500 hover:text-slate-400"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Group recommendations by project/workspace */}
          {(() => {
            // Check for empty filtered results
            if (filteredRecommendations.length === 0) {
              const emptyMessages: Record<
                FilterType,
                { title: string; message: string }
              > = {
                all: {
                  title: "No recommendations found",
                  message:
                    "Your usage is well-optimized! No major cost savings detected.",
                },
                critical: {
                  title: "No critical issues",
                  message:
                    "Great news! No urgent optimization opportunities found.",
                },
                warning: {
                  title: "No warnings",
                  message: "No moderate-priority optimizations detected.",
                },
                info: {
                  title: "No suggestions",
                  message: "No minor optimization opportunities at this time.",
                },
              };

              const { title, message } = emptyMessages[filter];

              return (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-200 mb-2">
                      {title}
                    </h3>
                    <p className="text-sm text-slate-400">{message}</p>
                  </div>
                </div>
              );
            }

            // Group recommendations by workspace
            const recommendationsByWorkspace: Record<
              string,
              typeof filteredRecommendations
            > = {};
            for (const f of filteredRecommendations) {
              const wsKey = f.ws || "—";
              if (!recommendationsByWorkspace[wsKey]) {
                recommendationsByWorkspace[wsKey] = [];
              }
              recommendationsByWorkspace[wsKey].push(f);
            }

            // Calculate max savings per workspace (avoid double-counting)
            const workspaceSavings: Record<string, number> = {};
            for (const [ws, recommendations] of Object.entries(
              recommendationsByWorkspace
            )) {
              const savingsByModel: Record<string, number> = {};
              for (const f of recommendations) {
                const modelKey = f.model;
                savingsByModel[modelKey] = Math.max(
                  savingsByModel[modelKey] || 0,
                  f.sav
                );
              }
              workspaceSavings[ws] = Object.values(savingsByModel).reduce(
                (sum, s) => sum + s,
                0
              );
            }

            // Sort workspaces by savings (highest first)
            const sortedWorkspaces = Object.keys(
              recommendationsByWorkspace
            ).sort((a, b) => workspaceSavings[b] - workspaceSavings[a]);

            // Map workspace names to colors and spend (match the Spend by Workspace section)
            const workspaceColors: Record<string, string> = {};
            const workspaceSpend: Record<string, number> = {};
            r.wss.forEach((w, i) => {
              const color = wColors[i % wColors.length];
              workspaceColors[w.name] = color;
              workspaceSpend[w.name] = w.spend;
              // Handle case variations (e.g., "default" vs "Default workspace")
              if (w.name.toLowerCase() === "default") {
                workspaceColors["Default workspace"] = color;
                workspaceColors["Default project"] = color;
                workspaceSpend["Default workspace"] = w.spend;
                workspaceSpend["Default project"] = w.spend;
              }
            });

            return (
              <div className="space-y-6">
                {sortedWorkspaces.map((ws) => (
                  <div key={ws} className="space-y-2">
                    {/* Workspace header */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${workspaceColors[ws] || "bg-slate-500"}`}
                        />
                        <h3 className="text-xs font-bold text-slate-300">
                          {ws}
                        </h3>
                      </div>
                      <div className="flex-1" />
                      <span className="text-xs text-slate-400">
                        {$(workspaceSpend[ws] || 0)}/mo spend
                      </span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-emerald-400 font-semibold">
                        {$(workspaceSavings[ws])}/mo recoverable
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {recommendationsByWorkspace[ws].length} recommendation
                        {recommendationsByWorkspace[ws].length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Recommendations for this workspace */}
                    <div className="space-y-2 pl-3">
                      {recommendationsByWorkspace[ws].map((f, key) => (
                        <Row
                          key={`${f.id}-${key}`}
                          f={f}
                          open={oid === f.id}
                          toggle={() => setOid(oid === f.id ? null : f.id)}
                          vendor={analysisRecord.vendor}
                          index={key + 1}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.03] p-8 text-center">
          <p className="text-lg font-bold text-emerald-400">
            No major waste patterns detected
          </p>
          <p className="text-sm text-slate-400 mt-2">
            Usage is well-optimized or spend is below analysis thresholds
            ($0.50/mo minimum).
          </p>
        </div>
      )}

      {/* Month Picker Modal */}
      {showMonthPicker && (
        <MonthPicker
          currentYear={year}
          currentMonth={month}
          onSelect={(selectedYear, selectedMonth) => {
            router.push(
              `/history/${id}/recommendations?year=${selectedYear}&month=${selectedMonth}`
            );
          }}
          onClose={() => setShowMonthPicker(false)}
        />
      )}
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center pt-24">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-6" />
          <p className="text-sm text-slate-300 font-medium">Loading...</p>
        </div>
      }
    >
      <RecommendationsPageContent />
    </Suspense>
  );
}
