"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { storage } from "@/lib/storage";
import type { AnalysisRecord } from "@/lib/storage";
import { $ } from "@/lib/formatters";
import Header from "@/components/Header";
import VendorBadge from "@/components/VendorBadge";
import Footer from "@/components/Footer";

export default function HistoryPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAnalyses(storage.getAllAnalyses());
  }, []);

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

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this analysis?")) {
      storage.deleteAnalysis(id);
      setAnalyses(storage.getAllAnalyses());
    }
  };

  const handleClearAll = () => {
    if (
      confirm(
        `Are you sure you want to delete all ${analyses.length} analyses? This cannot be undone.`
      )
    ) {
      analyses.forEach((a) => storage.deleteAnalysis(a.id));
      setAnalyses([]);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <Header currentPage="history" />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                Analysis History
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                View and manage your past analyses
              </p>
            </div>
            {analyses.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer font-medium"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {analyses.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-12">
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-300">
              No analyses yet
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-md">
              Run your first analysis to start tracking your Anthropic API usage
              and identify optimization opportunities.
            </p>
            <Link
              href="/"
              className="mt-6 rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
            >
              Get Started
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((analysis) => {
              // Skip analyses with old structure (no months object)
              if (
                !analysis.months ||
                Object.keys(analysis.months).length === 0
              ) {
                return null;
              }

              // Get most recent month data
              const monthKeys = Object.keys(analysis.months).sort().reverse();
              const latestMonthKey = monthKeys[0];
              const latestMonth = analysis.months[latestMonthKey];

              return (
                <Link
                  key={analysis.id}
                  href={`/history/${analysis.id}/recommendations?year=${latestMonth.year}&month=${latestMonth.month}`}
                  className="block group"
                >
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/60 transition-all cursor-pointer">
                    <div className="flex items-center justify-between gap-4">
                      <VendorBadge vendor={analysis.vendor} />
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                            {analysis.orgName}
                          </h3>
                          <span className="text-xs text-slate-500 font-mono">
                            {monthKeys.length} month
                            {monthKeys.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
                          <span className="font-mono">
                            Latest: {monthNames[latestMonth.month]}{" "}
                            {latestMonth.year}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-200">
                            {$(latestMonth.report.spend)} spend
                          </span>
                          {latestMonth.report.savings > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-semibold text-emerald-400">
                                {$(latestMonth.report.savings)} recoverable
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span>
                            {latestMonth.report.findings.length} findings
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={(e) => handleDelete(analysis.id, e)}
                          className="text-xs text-slate-500 hover:text-red-400 transition-colors cursor-pointer leading-none"
                        >
                          Clear
                        </button>
                        <svg
                          className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0"
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
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
