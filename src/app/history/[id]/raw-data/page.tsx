"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import RawDataViewer from "@/components/RawDataViewer";
import VendorBadge from "@/components/VendorBadge";
import { storage, Vendor } from "@/lib/storage";
import Stat from "@/components/Stat";
import { $, T, P } from "@/lib/formatters";

function RawDataPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [rawOpen, setRawOpen] = useState<string | null>(null);
  const [isRefreshing, _setIsRefreshing] = useState(false);

  // Load analysis from storage
  const analysisRecord = storage.getAnalysis(id);

  // Get year/month from URL params
  const urlYear = parseInt(searchParams.get("year") || "");
  const urlMonth = parseInt(searchParams.get("month") || "");

  const firstMonthKey = analysisRecord
    ? Object.keys(analysisRecord.months).sort()[0]
    : null;
  const [defaultYear, defaultMonth] = firstMonthKey
    ? firstMonthKey.split("-").map(Number)
    : [new Date().getFullYear(), new Date().getMonth()];

  const year = urlYear || defaultYear;
  const month = urlMonth >= 0 ? urlMonth : defaultMonth;

  const monthData = analysisRecord
    ? storage.getMonthData(id, year, month)
    : null;
  const r = monthData?.report;

  // Redirect if no analysis found
  useEffect(() => {
    if (!analysisRecord) {
      router.push("/");
    }
  }, [analysisRecord, router]);

  if (!analysisRecord || !monthData || !r) {
    return null;
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

  const handleRefresh = () => {
    // Navigate to recommendations page with refresh trigger
    router.push(
      `/history/${id}/recommendations?year=${year}&month=${month}&refresh=true`
    );
  };

  return (
    <div className="space-y-8">
      {/* Header with Vendor/Org and Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <VendorBadge vendor={analysisRecord.vendor} size="small" />
          <span className="text-sm text-bone font-medium">
            {analysisRecord.orgName}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            isRefreshing
              ? "text-bone-subtle cursor-not-allowed"
              : "text-moss hover:text-moss-light hover:bg-moss/10 cursor-pointer"
          }`}
          title="Refresh data from API"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b border-ink-border">
        <Link
          href={`/history/${id}/recommendations?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-bone-subtle hover:text-bone"
        >
          Recommendations
        </Link>
        <Link
          href={`/history/${id}/analytics?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-transparent text-bone-subtle hover:text-bone"
        >
          Analytics
        </Link>
        <Link
          href={`/history/${id}/raw-data?year=${year}&month=${month}`}
          className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px border-moss text-bone"
        >
          Raw API Data
        </Link>
      </div>

      {/* Month Display */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-bone-subtle">Raw API Data</h3>
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-bone">
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
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap justify-between gap-y-6 rounded-2xl border border-ink-border bg-ink-elevated p-6">
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

      {/* Raw Data Viewer */}
      <RawDataViewer
        data={monthData.rawData}
        openKey={rawOpen}
        onToggle={setRawOpen}
      />

      {/* Admin API Documentation Link */}
      <div className="rounded-lg border border-ink-border bg-ink/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4 text-bone-subtle"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-bone">
            Admin API Documentation
          </h3>
        </div>
        <p className="text-xs text-bone-subtle mb-3">
          Learn more about the{" "}
          {analysisRecord.vendor === Vendor.ANTHROPIC ? "Anthropic" : "OpenAI"}{" "}
          Admin API endpoints and response formats.
        </p>
        <a
          href={
            analysisRecord.vendor === Vendor.ANTHROPIC
              ? "https://docs.anthropic.com/en/api/admin-api"
              : "https://platform.openai.com/docs/api-reference/administration"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-moss hover:text-moss-light transition-colors font-medium"
        >
          View{" "}
          {analysisRecord.vendor === Vendor.ANTHROPIC ? "Anthropic" : "OpenAI"}{" "}
          Admin API Docs
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

export default function RawDataPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center pt-24">
          <div className="w-8 h-8 border-2 border-moss/30 border-t-moss rounded-full animate-spin mb-6" />
          <p className="text-sm text-bone font-medium">Loading...</p>
        </div>
      }
    >
      <RawDataPageContent />
    </Suspense>
  );
}
