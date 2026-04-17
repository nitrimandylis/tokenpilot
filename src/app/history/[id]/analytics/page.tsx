"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { storage, Vendor } from "@/lib/storage";
import VendorBadge from "@/components/VendorBadge";
import YearPicker from "@/components/YearPicker";
import Stat from "@/components/Stat";
import { $, T, P } from "@/lib/formatters";
import { useApiKey } from "@/contexts/ApiKeyContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function AnalyticsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getKey } = useApiKey();
  const id = params.id as string;
  const year = parseInt(
    searchParams.get("year") || new Date().getFullYear().toString()
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [isFetchingYear, setIsFetchingYear] = useState(false);
  const [analysisRecord, setAnalysisRecord] = useState(() =>
    storage.getAnalysis(id)
  );

  // Reload analysis from storage when id changes
  useEffect(() => {
    const record = storage.getAnalysis(id);
    setAnalysisRecord(record);
  }, [id]);

  // Check for missing months and fetch if needed
  useEffect(() => {
    if (!analysisRecord || isFetchingYear) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Determine which months we need for this year
    const endMonth = year === currentYear ? currentMonth : 11;
    const monthsNeeded = [];
    for (let m = 0; m <= endMonth; m++) {
      monthsNeeded.push(m);
    }

    // Check which months are missing
    const missingMonths = monthsNeeded.filter((m) => {
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      return !analysisRecord.months[monthKey];
    });

    // If we have missing months and we're looking at Anthropic, fetch them
    if (
      missingMonths.length > 0 &&
      analysisRecord.vendor === Vendor.ANTHROPIC
    ) {
      const apiKey = getKey(analysisRecord.vendor);
      if (!apiKey) {
        console.log(
          "[Analytics] Missing months but no API key available:",
          missingMonths
        );
        return;
      }

      console.log(
        `[Analytics] Fetching entire year ${year} data in one request to avoid rate limits`
      );
      setIsFetchingYear(true);

      const fetchYearData = async () => {
        try {
          const { call, fetchAllPages } = await import("@/lib/anthropic/api");
          const { agg, findIssues } = await import("@/lib/anthropic/analysis");
          const { tc } = await import("@/lib/anthropic/pricing");
          const { Severity } = await import("@/types");

          // Calculate year date range
          const now = new Date();
          const isCurrentYear = year === now.getFullYear();
          const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)); // Jan 1
          const endDate = isCurrentYear
            ? now
            : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)); // Dec 31

          const starting_at = startDate.toISOString().split(".")[0] + "Z";
          const ending_at = endDate.toISOString().split(".")[0] + "Z";

          console.log(
            `[Analytics] Fetching from ${startDate.toISOString()} to ${endDate.toISOString()}`
          );

          // Fetch organization info
          let org: any = { id: "", name: "Organization" };
          const raw: any = {};

          try {
            const orgData = await call(apiKey, "/v1/organizations/me");
            org = orgData;
            raw.org = orgData;
          } catch (e: any) {
            console.error("[Analytics] Failed to fetch org:", e);
            raw.org = { error: e.message };
          }

          // Fetch workspaces
          let workspaces: any[] = [];
          try {
            const wsData = await call(apiKey, "/v1/organizations/workspaces", {
              limit: 100,
            });
            workspaces = wsData.data || [];
            raw.workspaces = wsData;
          } catch (e: any) {
            console.error("[Analytics] Failed to fetch workspaces:", e);
            raw.workspaces = { error: e.message };
          }

          // Fetch usage data for entire year (3 calls with pagination)
          console.log("[Analytics] Fetching usage by model...");
          const bkRaw = await fetchAllPages(
            apiKey,
            "/v1/organizations/usage_report/messages",
            {
              starting_at,
              ending_at,
              group_by: ["model"],
              bucket_width: "day",
            }
          );

          console.log("[Analytics] Fetching usage by model+key...");
          const bmRaw = await fetchAllPages(
            apiKey,
            "/v1/organizations/usage_report/messages",
            {
              starting_at,
              ending_at,
              group_by: ["model", "api_key_id"],
              bucket_width: "day",
            }
          );

          console.log("[Analytics] Fetching usage by workspace+model...");
          const bwRaw = await fetchAllPages(
            apiKey,
            "/v1/organizations/usage_report/messages",
            {
              starting_at,
              ending_at,
              group_by: ["workspace_id", "model"],
              bucket_width: "day",
            }
          );

          console.log(
            `[Analytics] Fetched ${bkRaw.length + bmRaw.length + bwRaw.length} total usage buckets for entire year`
          );

          // Group usage buckets by month
          const groupByMonth = (buckets: any[]) => {
            const byMonth: Record<number, any[]> = {};
            for (const bucket of buckets) {
              if (!bucket.bucket_start) continue;
              const date = new Date(bucket.bucket_start);
              const month = date.getUTCMonth();
              if (!byMonth[month]) byMonth[month] = [];
              byMonth[month].push(bucket);
            }
            return byMonth;
          };

          const bkByMonth = groupByMonth(bkRaw);
          const bmByMonth = groupByMonth(bmRaw);
          const bwByMonth = groupByMonth(bwRaw);

          // Process and save each month
          for (const m of missingMonths) {
            const bk = bkByMonth[m] || [];
            const bm = bmByMonth[m] || [];
            const bw = bwByMonth[m] || [];

            console.log(
              `[Analytics] Processing month ${year}-${m} with ${bk.length + bm.length + bw.length} buckets`
            );

            // Aggregate and analyze
            const bkAgg = agg(bk);
            const bmAgg = agg(bm);
            const src = bkAgg.length ? bkAgg : bmAgg;
            const findings = findIssues(src, workspaces, bk.length ? bk : bm);

            let spend = 0;
            let ti = 0;
            let to = 0;
            for (const a of bmAgg.length ? bmAgg : src) {
              spend += tc(a.model, a.inp, a.out);
              ti += a.inp;
              to += a.out;
            }

            const bwAgg = agg(bw);
            const wa: Record<string, { id: string; spend: number }> = {};
            const wn: Record<string, string> = {};

            wa["default"] = { id: "default", spend: 0 };
            wn["default"] = "default";

            workspaces.forEach((w) => {
              wa[w.id] = { id: w.id, spend: 0 };
              wn[w.id] = w.display_name || w.name || w.id;
            });

            for (const w of bwAgg) {
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
              org,
              spend,
              savings: findings.reduce((s, f) => s + f.sav, 0),
              tokens: ti + to,
              findings,
              wss,
              keys:
                new Set(src.map((s) => s.kid).filter(Boolean)).size ||
                src.length,
              wc: workspaces.length || wss.length || 1,
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
              m,
              org.name || "Organization",
              org.id,
              report,
              { ...raw, bk, bm, bw }
            );

            console.log(`[Analytics] ✓ Saved month ${year}-${m}`);
          }

          // Reload from storage to get updated data
          setAnalysisRecord(storage.getAnalysis(id));
          setIsFetchingYear(false);
        } catch (error: any) {
          console.error("[Analytics] Error fetching year data:", error);
          setIsFetchingYear(false);
        }
      };

      fetchYearData();
    } else if (
      missingMonths.length > 0 &&
      analysisRecord.vendor === Vendor.OPENAI
    ) {
      const apiKey = getKey(analysisRecord.vendor);
      if (!apiKey) {
        console.log(
          "[Analytics] Missing months but no API key available:",
          missingMonths
        );
        return;
      }

      console.log(
        `[Analytics] Fetching entire year ${year} data in one request to avoid rate limits`
      );
      setIsFetchingYear(true);

      const fetchYearData = async () => {
        try {
          const { call } = await import("@/lib/openai/api");
          const { aggOpenAI, findIssuesOpenAI } =
            await import("@/lib/openai/analysis");
          const { tcOpenAI } = await import("@/lib/openai/pricing");
          const { Severity } = await import("@/types");

          // Calculate year date range
          const now = new Date();
          const isCurrentYear = year === now.getFullYear();
          const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)); // Jan 1
          const endDate = isCurrentYear
            ? now
            : new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)); // Dec 31

          const start_time = Math.floor(startDate.getTime() / 1000);
          const end_time = Math.floor(endDate.getTime() / 1000);

          console.log(
            `[Analytics] Fetching from ${startDate.toISOString()} to ${endDate.toISOString()}`
          );

          // Fetch all service endpoints for the entire year
          const usageEndpoints = [
            {
              endpoint: "/v1/organization/usage/completions",
              group_by: ["project_id", "model"],
            },
            {
              endpoint: "/v1/organization/usage/audio_speeches",
              group_by: ["project_id", "model"],
            },
            {
              endpoint: "/v1/organization/usage/audio_transcriptions",
              group_by: ["project_id", "model"],
            },
            {
              endpoint: "/v1/organization/usage/images",
              group_by: ["project_id", "model"],
            },
            {
              endpoint: "/v1/organization/usage/moderations",
              group_by: ["project_id", "model"],
            },
            {
              endpoint: "/v1/organization/usage/vector_stores",
              group_by: ["project_id"],
            },
            {
              endpoint: "/v1/organization/usage/code_interpreter_sessions",
              group_by: ["project_id"],
            },
          ];

          let allUsageData: any[] = [];
          const raw: any = {};

          // Fetch all usage data for the year with pagination
          for (const { endpoint, group_by } of usageEndpoints) {
            try {
              let nextPage: string | undefined = undefined;
              let pageCount = 0;
              const endpointName = endpoint.split("/").pop()!;

              // Fetch all pages
              do {
                const params: any = {
                  start_time,
                  end_time,
                  bucket_width: "1d",
                  group_by,
                };

                if (nextPage) {
                  params.page = nextPage;
                }

                const r = await call(apiKey, endpoint, params);

                // Store first page response in raw
                if (pageCount === 0) {
                  raw[endpointName] = r;
                }

                // Extract usage from buckets
                if (r.data && Array.isArray(r.data)) {
                  for (const bucket of r.data) {
                    if (bucket.results && bucket.results.length > 0) {
                      allUsageData.push(
                        ...bucket.results.map((result: any) => ({
                          ...result,
                          bucket_start_time: bucket.start_time,
                          service: endpointName,
                        }))
                      );
                    }
                  }
                }

                // Check for more pages
                nextPage = r.has_more ? r.next_page : undefined;
                pageCount++;

                // Safety limit: max 100 pages
                if (pageCount > 100) {
                  console.warn(`[Analytics] Hit page limit for ${endpoint}`);
                  break;
                }
              } while (nextPage);

              if (pageCount > 1) {
                console.log(
                  `[Analytics] Fetched ${pageCount} pages for ${endpointName}`
                );
              }
            } catch (e: any) {
              console.error(`[Analytics] Failed to fetch ${endpoint}:`, e);
              const endpointName = endpoint.split("/").pop()!;
              raw[endpointName] = { error: e.message };
            }
          }

          // Fetch projects
          let projects: any[] = [];
          let org: any = { id: "", name: "Organization" };
          try {
            const r = await call(apiKey, "/v1/organization/projects", {
              limit: 100,
            });
            projects = r.data || [];
            raw.projects = r;
            if (r.organization_id) org.id = r.organization_id;
            if (r.organization_name) org.name = r.organization_name;
          } catch (e: any) {
            console.error(`[Analytics] Failed to fetch projects:`, e);
            raw.projects = { error: e.message };
          }

          console.log(
            `[Analytics] Fetched ${allUsageData.length} usage records for entire year`
          );

          // Group usage data by month
          const usageByMonth: Record<number, any[]> = {};
          for (const record of allUsageData) {
            const timestamp =
              record.bucket_start_time || record.aggregation_timestamp;
            if (!timestamp) continue;

            const date = new Date(timestamp * 1000);
            const month = date.getUTCMonth();

            if (!usageByMonth[month]) {
              usageByMonth[month] = [];
            }
            usageByMonth[month].push(record);
          }

          // Process and save each month
          for (const m of missingMonths) {
            const monthUsageData = usageByMonth[m] || [];
            console.log(
              `[Analytics] Processing month ${year}-${m} with ${monthUsageData.length} records`
            );

            const usage = { data: monthUsageData };
            const projectUsage = aggOpenAI(usage);
            const findings = findIssuesOpenAI(projectUsage, projects);

            let spend = 0;
            const projectSpend: Record<string, number> = {};

            for (const p of projectUsage) {
              const pCost = tcOpenAI(p);
              spend += pCost;
              projectSpend[p.project_id] = pCost;
            }

            const projectsList = Object.entries(projectSpend)
              .map(([id, spend]) => ({
                id,
                name: projects.find((p: any) => p.id === id)?.name || id,
                spend,
              }))
              .sort((a, b) => b.spend - a.spend)
              .slice(0, 10);

            const report = {
              org,
              spend,
              savings: findings.reduce((s, f) => s + f.sav, 0),
              tokens: 0,
              findings,
              wss: projectsList,
              keys: 1,
              wc: projects.length,
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
              m,
              org.name || "Organization",
              org.id || "",
              report,
              { ...raw, usage }
            );

            console.log(`[Analytics] ✓ Saved month ${year}-${m}`);
          }

          // Reload from storage to get updated data
          setAnalysisRecord(storage.getAnalysis(id));
          setIsFetchingYear(false);
        } catch (error: any) {
          console.error("[Analytics] Error fetching year data:", error);
          setIsFetchingYear(false);
        }
      };

      fetchYearData();
    }
  }, [analysisRecord, year, id, getKey, isFetchingYear]);

  if (!analysisRecord) {
    return null;
  }

  const handleRefresh = () => {
    const now = new Date();
    router.push(
      `/history/${id}/recommendations?year=${now.getFullYear()}&month=${now.getMonth()}&refresh=true`
    );
  };

  // Get all months for the selected year
  const monthKeys = Object.keys(analysisRecord.months)
    .filter((key) => key.startsWith(`${year}-`))
    .sort();

  // Aggregate stats across all months in the year
  let yearSpend = 0;
  let yearSavings = 0;
  let yearTokens = 0;
  let yearFindings = 0;
  let yearCritCount = 0;
  let yearWarnCount = 0;
  let yearKeys = 0;
  let yearWc = 0;

  // Track all unique workspaces across the year
  const allWorkspaces = new Set<string>();
  const workspaceNames: Record<string, string> = {};

  // For OpenAI: track services and projects
  const allServices = new Set<string>();
  const allProjects = new Set<string>();
  const projectNames: Record<string, string> = {};

  const monthlyData: Array<{
    month: number;
    spend: number;
    savings: number;
    workspaces: Record<string, number>;
    services?: Record<string, number>; // OpenAI only
    projectServices?: Record<string, Record<string, number>>; // OpenAI: project -> service -> spend
  }> = [];

  for (let m = 0; m < 12; m++) {
    const monthKey = `${year}-${String(m).padStart(2, "0")}`;
    const monthData = analysisRecord.months[monthKey];

    if (monthData?.report) {
      const r = monthData.report;
      yearSpend += r.spend;
      yearSavings += r.savings;
      yearTokens += r.tokens;
      yearFindings += r.findings.length;
      yearCritCount += r.critCount;
      yearWarnCount += r.warnCount;
      yearKeys = Math.max(yearKeys, r.keys);
      yearWc = Math.max(yearWc, r.wc);

      // Build workspace spend map for this month
      const workspaceSpend: Record<string, number> = {};
      r.wss.forEach((w) => {
        allWorkspaces.add(w.id);
        workspaceNames[w.id] = w.name;
        workspaceSpend[w.id] = w.spend;
      });

      // For OpenAI: aggregate by service and project-service
      const serviceSpend: Record<string, number> = {};
      const projectServiceSpend: Record<string, Record<string, number>> = {};

      if (
        analysisRecord.vendor === Vendor.OPENAI &&
        monthData.rawData &&
        (monthData.rawData as any).usage
      ) {
        const rawUsage = (monthData.rawData as any).usage;
        const usageData = rawUsage.data || [];

        // Import OpenAI pricing function
        const { tcOpenAI } = require("@/lib/openai/pricing");

        for (const record of usageData) {
          const service = record.service || "completions";
          const projectId = record.project_id || "default";
          const model = record.model || record.snapshot_id || "unknown";

          // Calculate cost for this record
          const inp = record.input_uncached_tokens || record.input_tokens || 0;
          const out = record.output_tokens || record.output_text_tokens || 0;
          const cost = tcOpenAI(model, inp, out);

          // Track service
          allServices.add(service);
          if (!serviceSpend[service]) {
            serviceSpend[service] = 0;
          }
          serviceSpend[service] += cost;

          // Track project
          allProjects.add(projectId);
          if (!projectNames[projectId]) {
            projectNames[projectId] = projectId;
          }

          // Track project-service combination
          if (!projectServiceSpend[projectId]) {
            projectServiceSpend[projectId] = {};
          }
          if (!projectServiceSpend[projectId][service]) {
            projectServiceSpend[projectId][service] = 0;
          }
          projectServiceSpend[projectId][service] += cost;
        }

        // Get project names from report
        r.wss.forEach((w) => {
          if (w.id && w.name) {
            projectNames[w.id] = w.name;
          }
        });
      }

      monthlyData.push({
        month: m,
        spend: r.spend,
        savings: r.savings,
        workspaces: workspaceSpend,
        services: serviceSpend,
        projectServices: projectServiceSpend,
      });
    } else {
      monthlyData.push({
        month: m,
        spend: 0,
        savings: 0,
        workspaces: {},
        services: {},
        projectServices: {},
      });
    }
  }

  // Create sorted workspace list (by total spend across year)
  const workspaceTotals: Record<string, number> = {};
  allWorkspaces.forEach((wsId) => {
    workspaceTotals[wsId] = monthlyData.reduce(
      (sum, m) => sum + (m.workspaces[wsId] || 0),
      0
    );
  });

  const sortedWorkspaces = Array.from(allWorkspaces).sort(
    (a, b) => workspaceTotals[b] - workspaceTotals[a]
  );

  // For OpenAI: calculate service totals
  const serviceTotals: Record<string, number> = {};
  allServices.forEach((service) => {
    serviceTotals[service] = monthlyData.reduce(
      (sum, m) => sum + ((m.services && m.services[service]) || 0),
      0
    );
  });

  const sortedServices = Array.from(allServices).sort(
    (a, b) => serviceTotals[b] - serviceTotals[a]
  );

  // Service name mapping
  const serviceLabels: Record<string, string> = {
    completions: "Completions",
    embeddings: "Embeddings",
    audio_speeches: "Audio (TTS)",
    audio_transcriptions: "Audio (Transcription)",
    images: "Images",
    moderations: "Moderations",
    vector_stores: "Vector Stores",
    code_interpreter_sessions: "Code Interpreter",
  };

  // For OpenAI: calculate per-project service totals
  const projectServiceTotals: Record<string, Record<string, number>> = {};
  allProjects.forEach((projectId) => {
    projectServiceTotals[projectId] = {};
    allServices.forEach((service) => {
      projectServiceTotals[projectId][service] = monthlyData.reduce(
        (sum, m) =>
          sum +
          ((m.projectServices &&
            m.projectServices[projectId] &&
            m.projectServices[projectId][service]) ||
            0),
        0
      );
    });
  });

  const sortedProjects = Array.from(allProjects).sort((a, b) => {
    const totalA = Object.values(projectServiceTotals[a]).reduce(
      (s, v) => s + v,
      0
    );
    const totalB = Object.values(projectServiceTotals[b]).reduce(
      (s, v) => s + v,
      0
    );
    return totalB - totalA;
  });

  // Color mapping for consistency with chart
  const colorClasses = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
    "bg-orange-500",
  ];

  // Show loading state while fetching year data
  if (isFetchingYear) {
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
          Analyzing {year}
        </p>
        <p className="text-xs text-slate-500">
          Fetching usage data and running optimization analysis...
        </p>
      </div>
    );
  }

  // If no data for this year, show message
  if (yearSpend === 0 && monthKeys.length === 0) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <VendorBadge vendor={analysisRecord.vendor} size="small" />
            <span className="text-sm text-slate-300 font-medium">
              {analysisRecord.orgName}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
            title="Refresh data from API"
          >
            Refresh
          </button>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
          <p className="text-sm text-slate-400">
            No data for {year}. Run an analysis to see yearly trends.
          </p>
        </div>
      </div>
    );
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
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
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            isRefreshing
              ? "text-slate-600 cursor-not-allowed"
              : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
          }`}
          title="Refresh data from API"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-800">
        <Link
          href={`/history/${id}/recommendations?year=${new Date().getFullYear()}&month=${new Date().getMonth()}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-slate-500 hover:text-slate-400"
        >
          Recommendations
        </Link>
        <Link
          href={`/history/${id}/analytics?year=${new Date().getFullYear()}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-emerald-500 text-slate-200"
        >
          Analytics
        </Link>
        <Link
          href={`/history/${id}/raw-data?year=${new Date().getFullYear()}&month=${new Date().getMonth()}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-slate-500 hover:text-slate-400"
        >
          Raw API Data
        </Link>
      </div>

      {/* Year Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
          Yearly Analytics
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              router.push(`/history/${id}/analytics?year=${year - 1}`);
            }}
            className="p-1.5 text-slate-500 hover:text-emerald-400 cursor-pointer transition-colors rounded hover:bg-slate-800/50"
            title="Previous year"
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
            onClick={() => setShowYearPicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-200 cursor-pointer rounded-lg hover:bg-slate-800/50 transition-colors"
            title="Select year"
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
            {year}
          </button>

          <button
            onClick={() => {
              const currentYear = new Date().getFullYear();
              if (year >= currentYear) return;
              router.push(`/history/${id}/analytics?year=${year + 1}`);
            }}
            disabled={year >= new Date().getFullYear()}
            className={`p-1.5 transition-colors rounded hover:bg-slate-800/50 ${
              year >= new Date().getFullYear()
                ? "text-slate-700 cursor-not-allowed"
                : "text-slate-500 hover:text-emerald-400 cursor-pointer"
            }`}
            title="Next year"
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

          {year !== new Date().getFullYear() && (
            <div className="w-px h-4 bg-slate-700 mx-1" />
          )}

          {year !== new Date().getFullYear() && (
            <button
              onClick={() => {
                router.push(
                  `/history/${id}/analytics?year=${new Date().getFullYear()}`
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
          label={`${year} Total Spend`}
          value={$(yearSpend)}
          sub={
            analysisRecord.vendor === Vendor.ANTHROPIC
              ? `${yearKeys} keys · ${yearWc} workspaces`
              : `${yearWc} projects`
          }
        />
        <Stat
          label="Recoverable"
          value={$(yearSavings)}
          sub={yearSpend > 0 ? `${P(yearSavings, yearSpend)}% of spend` : ""}
          g
        />
        <Stat
          label="Recommendations"
          value={yearFindings}
          sub={`${yearCritCount} critical · ${yearWarnCount} warning`}
          y={yearFindings > 0}
        />
        <Stat label={`Tokens / ${year}`} value={T(yearTokens)} />
      </div>

      {/* Workspace Spend Breakdown */}
      {sortedWorkspaces.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
            {analysisRecord.vendor === Vendor.ANTHROPIC
              ? "Workspace"
              : "Project"}{" "}
            Breakdown
          </h3>
          <div className="space-y-3">
            {sortedWorkspaces.map((wsId, idx) => {
              const total = workspaceTotals[wsId];
              const percentage = yearSpend > 0 ? (total / yearSpend) * 100 : 0;

              // Calculate average monthly spend
              const monthsWithData = monthlyData.filter(
                (m) => (m.workspaces[wsId] || 0) > 0
              ).length;
              const avgMonthly =
                monthsWithData > 0 ? total / monthsWithData : 0;

              return (
                <div key={wsId} className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded ${colorClasses[idx % colorClasses.length]} shrink-0`}
                  />
                  <span className="text-xs text-slate-400 w-32 font-medium truncate">
                    {workspaceNames[wsId]}
                  </span>
                  <div className="flex-1 h-5 bg-slate-800/50 rounded overflow-hidden relative">
                    {total > 0 && (
                      <div
                        className={`h-full ${colorClasses[idx % colorClasses.length]} rounded opacity-70`}
                        style={{
                          width: `${Math.max(percentage, 2)}%`,
                          transition: "width 1s ease",
                        }}
                      />
                    )}
                    <span className="absolute right-2 top-0.5 text-[10px] font-bold text-slate-200 font-mono">
                      {$(total)}
                    </span>
                  </div>
                  <div className="text-right shrink-0 w-24">
                    <div className="text-[10px] text-slate-500">
                      {percentage.toFixed(1)}% of total
                    </div>
                    <div className="text-[9px] text-slate-600">
                      ~{$(avgMonthly)}/mo avg
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tip if only default workspace */}
          {sortedWorkspaces.length === 1 &&
            sortedWorkspaces[0] === "default" && (
              <div className="mt-4 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-emerald-400/90 font-semibold">
                    💡 Recommendation
                  </p>
                  <span className="text-[10px] font-bold text-emerald-400">
                    100% CONFIDENCE
                  </span>
                </div>
                <p className="text-xs text-emerald-400/80">
                  All usage is in the default{" "}
                  {analysisRecord.vendor === Vendor.ANTHROPIC
                    ? "workspace"
                    : "project"}
                  . Consider creating custom{" "}
                  {analysisRecord.vendor === Vendor.ANTHROPIC
                    ? "workspaces"
                    : "projects"}{" "}
                  to track spend by team, feature, or environment for better
                  cost visibility and analysis.
                </p>
              </div>
            )}
        </div>
      )}

      {/* Monthly Spend Chart - Stacked by Workspace */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
          Monthly Spend by{" "}
          {analysisRecord.vendor === Vendor.ANTHROPIC ? "Workspace" : "Project"}{" "}
          - {year}
        </h3>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={monthlyData.map((data, i) => ({
              month: monthNames[i],
              ...sortedWorkspaces.reduce(
                (acc, wsId) => {
                  acc[workspaceNames[wsId]] = data.workspaces[wsId] || 0;
                  return acc;
                },
                {} as Record<string, number>
              ),
            }))}
            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="month"
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="#334155"
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              stroke="#334155"
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "8px",
                fontSize: "12px",
                padding: "8px 12px",
              }}
              labelStyle={{
                color: "#e2e8f0",
                fontWeight: 600,
                marginBottom: "4px",
              }}
              itemStyle={{ color: "#cbd5e1" }}
              cursor={{ fill: "#1e293b", opacity: 0.3 }}
              labelFormatter={(label) => `${label} ${year}`}
              formatter={(value) => $(typeof value === "number" ? value : 0)}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }}
              iconType="circle"
            />
            {sortedWorkspaces.map((wsId, idx) => {
              const colorMap = {
                0: "#3b82f6", // blue
                1: "#8b5cf6", // violet
                2: "#f59e0b", // amber
                3: "#10b981", // emerald
                4: "#f43f5e", // rose
                5: "#06b6d4", // cyan
                6: "#6366f1", // indigo
                7: "#f97316", // orange
              };
              return (
                <Bar
                  key={wsId}
                  dataKey={workspaceNames[wsId]}
                  stackId="spend"
                  fill={colorMap[(idx % 8) as keyof typeof colorMap]}
                  radius={
                    idx === sortedWorkspaces.length - 1
                      ? [4, 4, 0, 0]
                      : [0, 0, 0, 0]
                  }
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* OpenAI: Monthly Spend by Service Chart */}
      {analysisRecord.vendor === Vendor.OPENAI && sortedServices.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">
            Monthly Spend by Service - {year}
          </h3>

          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={monthlyData.map((data, i) => ({
                month: monthNames[i],
                ...sortedServices.reduce(
                  (acc, service) => {
                    acc[serviceLabels[service] || service] =
                      (data.services && data.services[service]) || 0;
                    return acc;
                  },
                  {} as Record<string, number>
                ),
              }))}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#64748b", fontSize: 11 }}
                stroke="#334155"
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                stroke="#334155"
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                  fontSize: "12px",
                  padding: "8px 12px",
                }}
                labelStyle={{
                  color: "#e2e8f0",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
                itemStyle={{ color: "#cbd5e1" }}
                cursor={{ fill: "#1e293b", opacity: 0.3 }}
                labelFormatter={(label) => `${label} ${year}`}
                formatter={(value) => $(typeof value === "number" ? value : 0)}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }}
                iconType="circle"
              />
              {sortedServices.map((service, idx) => {
                const colorMap = {
                  0: "#3b82f6", // blue
                  1: "#8b5cf6", // violet
                  2: "#f59e0b", // amber
                  3: "#10b981", // emerald
                  4: "#f43f5e", // rose
                  5: "#06b6d4", // cyan
                  6: "#6366f1", // indigo
                  7: "#f97316", // orange
                };
                return (
                  <Bar
                    key={service}
                    dataKey={serviceLabels[service] || service}
                    stackId="spend"
                    fill={colorMap[(idx % 8) as keyof typeof colorMap]}
                    radius={
                      idx === sortedServices.length - 1
                        ? [4, 4, 0, 0]
                        : [0, 0, 0, 0]
                    }
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OpenAI: Per-Project Service Breakdown Charts */}
      {analysisRecord.vendor === Vendor.OPENAI &&
        sortedProjects.length > 0 &&
        sortedProjects.map((projectId) => {
          const projectTotal = Object.values(
            projectServiceTotals[projectId]
          ).reduce((s, v) => s + v, 0);

          // Only show projects with spend > 0
          if (projectTotal === 0) return null;

          // Get services used by this project (sorted by spend)
          const projectServicesUsed = sortedServices.filter(
            (service) => (projectServiceTotals[projectId][service] || 0) > 0
          );

          return (
            <div
              key={projectId}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                {projectNames[projectId] || projectId} - Service Breakdown
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Total: {$(projectTotal)} across {projectServicesUsed.length}{" "}
                service
                {projectServicesUsed.length !== 1 ? "s" : ""}
              </p>

              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={monthlyData.map((data, i) => ({
                    month: monthNames[i],
                    ...projectServicesUsed.reduce(
                      (acc, service) => {
                        acc[serviceLabels[service] || service] =
                          (data.projectServices &&
                            data.projectServices[projectId] &&
                            data.projectServices[projectId][service]) ||
                          0;
                        return acc;
                      },
                      {} as Record<string, number>
                    ),
                  }))}
                  margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    stroke="#334155"
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    stroke="#334155"
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #475569",
                      borderRadius: "8px",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                    labelStyle={{
                      color: "#e2e8f0",
                      fontWeight: 600,
                      marginBottom: "4px",
                    }}
                    itemStyle={{ color: "#cbd5e1" }}
                    cursor={{ fill: "#1e293b", opacity: 0.3 }}
                    labelFormatter={(label) => `${label} ${year}`}
                    formatter={(value) =>
                      $(typeof value === "number" ? value : 0)
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }}
                    iconType="circle"
                  />
                  {projectServicesUsed.map((service, idx) => {
                    const colorMap = {
                      0: "#3b82f6", // blue
                      1: "#8b5cf6", // violet
                      2: "#f59e0b", // amber
                      3: "#10b981", // emerald
                      4: "#f43f5e", // rose
                      5: "#06b6d4", // cyan
                      6: "#6366f1", // indigo
                      7: "#f97316", // orange
                    };
                    return (
                      <Bar
                        key={service}
                        dataKey={serviceLabels[service] || service}
                        stackId="spend"
                        fill={colorMap[(idx % 8) as keyof typeof colorMap]}
                        radius={
                          idx === projectServicesUsed.length - 1
                            ? [4, 4, 0, 0]
                            : [0, 0, 0, 0]
                        }
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}

      {/* Year Picker Modal */}
      {showYearPicker && (
        <YearPicker
          currentYear={year}
          onSelect={(selectedYear) => {
            router.push(`/history/${id}/analytics?year=${selectedYear}`);
          }}
          onClose={() => setShowYearPicker(false)}
        />
      )}
    </div>
  );
}
