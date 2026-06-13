"use client";

import { useSearchParams, useRouter, useParams } from "next/navigation";
import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import Stat from "@/components/Stat";
import Row from "@/components/Row";
import VendorBadge from "@/components/VendorBadge";
import MonthPicker from "@/components/MonthPicker";
import { CountUp } from "@/components/motion/CountUp";
import { $, T, P } from "@/lib/formatters";
import { storage, Vendor } from "@/lib/storage";
import type { MonthData } from "@/lib/storage";
import type { Report } from "@/types";
import { useApiKey } from "@/contexts/ApiKeyContext";
import { PRICING_TABLE_DATE as ANTHROPIC_PRICING_DATE } from "@/lib/anthropic/pricing";
import { PRICING_TABLE_DATE as OPENAI_PRICING_DATE } from "@/lib/openai/pricing";

type FilterType = "all" | "critical" | "warning" | "info";

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

function RecommendationsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { getKey } = useApiKey();

  const [filter, setFilter] = useState<FilterType>("all");
  const [oid, setOid] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);
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

  // Previous month for MoM comparison
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthData: MonthData | null = analysisRecord
    ? storage.getMonthData(id, prevYear, prevMonth)
    : null;
  const momSpendDelta =
    prevMonthData && r && prevMonthData.report.spend > 0
      ? (r.spend - prevMonthData.report.spend) / prevMonthData.report.spend
      : null;

  // Stale-pricing guard: warn if pricing table > 90 days old
  const pricingDate =
    analysisRecord?.vendor === Vendor.ANTHROPIC
      ? ANTHROPIC_PRICING_DATE
      : OPENAI_PRICING_DATE;
  const pricingAgeDays = Math.floor(
    (Date.now() - new Date(pricingDate).getTime()) / 86_400_000
  );
  const pricingStale = pricingAgeDays > 90;

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
      storage.clearMonthData(id, year, month);
      setForceRefresh(false);
      // After clearing, the next check will see no data and fetch
    }

    const hasData = storage.hasMonthData(id, year, month);

    if (!hasData) {
      // Try to fetch this month's data
      const apiKey = getKey(analysisRecord.vendor);

      if (!apiKey) {
        // No API key in sessionStorage - show error
        setFetchError(
          `Data for ${year}-${String(month + 1).padStart(2, "0")} hasn't been fetched yet. Please go to home and run a new analysis to cache the API key in this session.`
        );
        return;
      }

      // We have an API key - fetch the data
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

            const wss = Object.values(projectSpend)
              .map((p) => ({ ...p, name: projectNames[p.id] || p.id }))
              .sort((a, b) => b.spend - a.spend)
              .slice(0, 10);

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
        } catch (error: unknown) {
          setFetchError(
            error instanceof Error ? error.message : "Failed to fetch data"
          );
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

  const exportCSV = (report: Report) => {
    const headers = [
      "Recommendation",
      "Category",
      "Severity",
      "Model",
      "Workspace",
      "Spend/mo",
      "Savings/mo",
      "Confidence",
      "Action",
    ];
    const rows = report.findings.map((f) => [
      f.name,
      f.cat,
      f.sev,
      f.ml,
      f.ws,
      `$${f.cur.toFixed(2)}`,
      `$${f.sav.toFixed(2)}`,
      `${Math.round(f.conf * 100)}%`,
      f.action,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokenpilot-${analysisRecord!.orgName}-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const exportJSON = (report: Report) => {
    const payload = {
      org: analysisRecord!.orgName,
      vendor: analysisRecord!.vendor,
      period: `${year}-${String(month + 1).padStart(2, "0")}`,
      generatedAt: new Date().toISOString(),
      spend: report.spend,
      savings: report.savings,
      tokens: report.tokens,
      findings: report.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tokenpilot-${analysisRecord!.orgName}-${year}-${String(month + 1).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  if (!analysisRecord) {
    return null;
  }

  if (isFetching) {
    return (
      <div className="space-y-8">
        {/* Skeleton stats bar */}
        <div className="h-8 w-48 bg-ink-elevated rounded-sm animate-pulse" />
        <div className="flex flex-wrap gap-y-6 rounded-sm border border-ink-border bg-ink-elevated p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 min-w-[120px] space-y-2">
              <div className="h-3 w-20 bg-ink-border rounded animate-pulse" />
              <div className="h-6 w-16 bg-ink-border rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Spinner + status */}
        <div className="flex items-center gap-3 py-2">
          <div className="w-4 h-4 border-2 border-moss/30 border-t-moss rounded-full animate-spin shrink-0" />
          <p className="text-sm text-bone-subtle">
            Analyzing {monthNames[month]} {year}…
          </p>
        </div>
        {/* Skeleton rows */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-ink-border bg-ink-elevated px-5 py-4 flex items-center gap-4"
              style={{ opacity: 1 - i * 0.15 }}
            >
              <div className="w-5 h-3 bg-ink-border rounded animate-pulse shrink-0" />
              <div className="w-16 h-5 bg-ink-border rounded animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-ink-border rounded animate-pulse w-3/4" />
                <div className="h-3 bg-ink-border rounded animate-pulse w-1/2" />
              </div>
              <div className="w-20 h-4 bg-ink-border rounded animate-pulse hidden sm:block shrink-0" />
              <div className="w-16 h-6 bg-ink-border rounded animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-sm border border-critical/30 bg-critical/5 p-6">
        <p className="text-sm text-bone-muted">{fetchError}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-moss hover:text-moss-light"
        >
          ← Back to home
        </Link>
      </div>
    );
  }

  if (!monthData || !r) {
    return (
      <div className="rounded-sm border border-ink-border bg-ink-elevated p-6">
        <p className="text-sm text-bone-muted">
          No data for {year}-{String(month + 1).padStart(2, "0")}
        </p>
      </div>
    );
  }

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
          <span className="text-sm text-bone font-medium">
            {analysisRecord.orgName}
          </span>
          {r && r.savings > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-moss/10 border border-moss/20 text-xs font-mono font-medium text-moss-light">
              Save {$(r.savings)}/mo
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 no-print">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExport((v) => !v)}
              disabled={!r}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-sm transition-colors text-bone-subtle hover:text-bone hover:bg-ink-elevated cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export report"
            >
              Export
              <svg
                className={`w-3 h-3 transition-transform ${showExport ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {showExport && r && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowExport(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-sm border border-ink-border bg-ink-elevated shadow-lg overflow-hidden">
                  <button
                    onClick={() => exportCSV(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-bone-muted hover:text-bone hover:bg-ink-hover transition-colors cursor-pointer text-left"
                  >
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Download CSV
                  </button>
                  <button
                    onClick={() => exportJSON(r)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-bone-muted hover:text-bone hover:bg-ink-hover transition-colors cursor-pointer text-left"
                  >
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                      />
                    </svg>
                    Download JSON
                  </button>
                  <div className="h-px bg-ink-border mx-3" />
                  <button
                    onClick={() => {
                      setExpandAll(true);
                      setShowExport(false);
                      setTimeout(() => window.print(), 100);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-bone-muted hover:text-bone hover:bg-ink-hover transition-colors cursor-pointer text-left"
                  >
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    Print / PDF
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setForceRefresh(true)}
            disabled={isFetching}
            className={`text-xs font-medium px-3 py-1.5 rounded-sm transition-colors ${
              isFetching
                ? "text-bone-subtle cursor-not-allowed"
                : "text-moss hover:bg-ink-elevated cursor-pointer"
            }`}
            title="Refresh data from API"
          >
            {isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b border-ink-border">
        <Link
          href={`/history/${id}/recommendations?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-moss text-bone"
        >
          Recommendations
        </Link>
        <Link
          href={`/history/${id}/analytics?year=${year}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-bone-subtle hover:text-bone"
        >
          Analytics
        </Link>
        <Link
          href={`/history/${id}/raw-data?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-bone-subtle hover:text-bone"
        >
          Raw data
        </Link>
      </div>

      {/* Stale-pricing warning */}
      {pricingStale && (
        <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/5 px-4 py-3 no-print">
          <svg
            className="w-4 h-4 text-warning shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-xs text-warning/90">
            Pricing table last verified {pricingAgeDays} days ago — savings
            estimates may be off. Check{" "}
            {analysisRecord.vendor === Vendor.ANTHROPIC
              ? "anthropic.com/pricing"
              : "openai.com/api/pricing"}{" "}
            for current rates.
          </p>
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-bone-subtle">
          Monthly analysis
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
            className="p-1.5 text-bone-subtle hover:text-bone cursor-pointer transition-colors rounded hover:bg-ink-elevated"
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
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-bone hover:bg-ink-elevated cursor-pointer rounded-sm transition-colors"
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
            className={`p-1.5 transition-colors rounded hover:bg-ink-elevated ${
              year === new Date().getFullYear() &&
              month === new Date().getMonth()
                ? "text-bone-subtle/30 cursor-not-allowed"
                : "text-bone-subtle hover:text-bone cursor-pointer"
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
            <div className="w-px h-4 bg-ink-border mx-1" />
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
              className="text-xs font-semibold text-moss hover:text-moss-light px-2 py-1 rounded hover:bg-ink-elevated cursor-pointer transition-colors"
            >
              Jump to Current
            </button>
          )}
        </div>
      </div>

      {/* Savings title band */}
      <div className="rounded-sm bg-ink-elevated border border-ink-border px-6 py-5">
        <p className="text-xs text-bone-subtle font-sans mb-1">
          {monthNames[month]} {year} · {analysisRecord.orgName}
        </p>
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-4xl font-bold text-bone"
            style={{ letterSpacing: "-0.03em" }}
          >
            You could save
          </span>
          <CountUp
            value={r.savings}
            prefix="$"
            suffix="/mo"
            decimals={0}
            className="font-display text-4xl font-bold text-moss-light"
          />
        </div>
        {r.savings > 0 && (
          <p className="text-xs text-bone-subtle mt-1">
            {P(r.savings, r.spend)}% of current {$(r.spend)}/mo spend
            {momSpendDelta !== null && (
              <span
                className={`ml-3 font-mono font-medium ${
                  momSpendDelta > 0.05
                    ? "text-critical"
                    : momSpendDelta < -0.05
                      ? "text-moss-light"
                      : "text-bone-subtle"
                }`}
              >
                {momSpendDelta > 0 ? "↑" : "↓"}{" "}
                {Math.abs(momSpendDelta * 100).toFixed(0)}% vs last mo
              </span>
            )}
          </p>
        )}
        {momSpendDelta !== null && r.savings === 0 && (
          <p className="text-xs text-bone-subtle mt-1">
            <span
              className={`font-mono font-medium ${
                momSpendDelta > 0.05
                  ? "text-critical"
                  : momSpendDelta < -0.05
                    ? "text-moss-light"
                    : "text-bone-subtle"
              }`}
            >
              {momSpendDelta > 0 ? "↑" : "↓"}{" "}
              {Math.abs(momSpendDelta * 100).toFixed(0)}% vs last mo
            </span>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap justify-between gap-y-6 rounded-sm border border-ink-border bg-ink-elevated p-6">
        <Stat
          label="Monthly Spend"
          value={$(r.spend)}
          sub={
            momSpendDelta !== null
              ? `${momSpendDelta > 0 ? "↑" : "↓"}${Math.abs(momSpendDelta * 100).toFixed(0)}% vs last mo`
              : analysisRecord.vendor === Vendor.ANTHROPIC
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
            <h2 className="text-sm font-semibold text-bone">
              Recommendations{" "}
              <span className="ml-2 text-xs font-normal text-bone-subtle">
                {filteredRecommendations.length} shown · {$(r.savings)}/mo total
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpandAll((v) => !v)}
                className="text-[10px] font-medium text-bone-subtle hover:text-bone transition-colors cursor-pointer no-print"
              >
                {expandAll ? "Collapse all" : "Expand all"}
              </button>
              <div className="w-px h-3 bg-ink-border" />
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
                    className={`px-2.5 py-1 rounded-sm text-[10px] font-medium transition-colors cursor-pointer ${
                      filter === k
                        ? "bg-ink-elevated text-bone border border-ink-border"
                        : "text-bone-subtle hover:text-bone"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
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
                <div className="rounded-sm border border-ink-border bg-ink-elevated p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 rounded-full bg-moss/10 border border-moss/20 flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-moss"
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
                    <h3 className="text-lg font-bold text-bone mb-2">
                      {title}
                    </h3>
                    <p className="text-sm text-bone-subtle">{message}</p>
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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-ink-elevated border border-ink-border">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${workspaceColors[ws] || "bg-bone-subtle"}`}
                        />
                        <h3 className="text-xs font-bold text-bone">{ws}</h3>
                      </div>
                      <div className="flex-1" />
                      <span className="text-xs text-bone-subtle">
                        {$(workspaceSpend[ws] || 0)}/mo spend
                      </span>
                      <span className="text-xs text-bone-subtle">·</span>
                      <span className="text-xs text-moss-light font-semibold font-mono">
                        {$(workspaceSavings[ws])}/mo recoverable
                      </span>
                      <span className="text-[10px] text-bone-subtle">
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
                          open={expandAll || oid === f.id}
                          toggle={() => {
                            setExpandAll(false);
                            setOid(oid === f.id ? null : f.id);
                          }}
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
        <div className="rounded-sm border border-moss/20 bg-moss/[0.03] p-8 text-center">
          <p
            className="text-lg font-semibold text-bone font-display"
            style={{ letterSpacing: "-0.02em" }}
          >
            No major waste patterns detected
          </p>
          <p className="text-sm text-bone-subtle mt-2">
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
          <div className="w-8 h-8 border-2 border-moss/30 border-t-moss rounded-full animate-spin mb-6" />
          <p className="text-sm text-bone font-medium">Loading...</p>
        </div>
      }
    >
      <RecommendationsPageContent />
    </Suspense>
  );
}
