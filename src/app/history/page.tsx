"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { storage } from "@/lib/storage";
import type { AnalysisRecord } from "@/lib/storage";
import { $ } from "@/lib/formatters";
import Header from "@/components/Header";
import VendorBadge from "@/components/VendorBadge";
import Footer from "@/components/Footer";

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

export default function HistoryPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAnalyses(storage.getAllAnalyses());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        router.push("/");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

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
      setAnalyses(storage.getAllAnalyses());
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-ink text-bone font-sans flex flex-col">
      <Header currentPage="history" />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="font-display text-3xl font-semibold text-bone"
                style={{ letterSpacing: "-0.03em" }}
              >
                Analysis history
              </h1>
              <p className="text-sm text-bone-subtle mt-1 font-sans">
                View and manage past analyses
              </p>
            </div>
            {analyses.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-bone-subtle hover:text-critical transition-colors cursor-pointer font-medium"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {analyses.length === 0 ? (
          <motion.div
            className="flex flex-col items-center text-center pt-12"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <motion.div
              className="w-16 h-16 rounded-sm bg-ink-elevated border border-ink-border flex items-center justify-center mb-4"
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <svg
                className="w-8 h-8 text-bone-subtle"
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
            </motion.div>
            <h2
              className="text-lg font-semibold text-bone font-display"
              style={{ letterSpacing: "-0.02em" }}
            >
              No analyses yet
            </h2>
            <p className="text-sm text-bone-subtle mt-2 max-w-md font-sans">
              Run your first analysis to start tracking your API usage and
              identify optimization opportunities.
            </p>
            <Link
              href="/"
              className="mt-6 rounded-sm bg-moss px-6 py-2.5 text-sm font-medium text-bone hover:bg-moss-light transition-colors"
            >
              Get started →
            </Link>
            <p className="mt-4 text-xs text-bone-subtle font-mono">
              Tip: Press ⌘K anywhere to start a new analysis
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {analyses.map((analysis, idx) => {
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
              const cardIndex = String(idx + 1).padStart(2, "0");

              return (
                <Link
                  key={analysis.id}
                  href={`/history/${analysis.id}/recommendations?year=${latestMonth.year}&month=${latestMonth.month}`}
                  className="block group"
                >
                  <div className="rounded-sm border border-ink-border bg-ink-elevated p-5 hover:bg-ink-hover transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      {/* Index */}
                      <span className="font-mono text-xs text-bone-subtle shrink-0 w-6">
                        {cardIndex}
                      </span>

                      {/* Vendor badge */}
                      <VendorBadge vendor={analysis.vendor} size="small" />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-base font-semibold text-bone font-sans group-hover:text-bone transition-colors">
                            {analysis.orgName}
                          </h3>
                          <span className="text-xs text-bone-subtle font-mono">
                            {monthKeys.length} month
                            {monthKeys.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-bone-subtle flex-wrap">
                          <span className="font-mono">
                            Latest: {monthNames[latestMonth.month]}{" "}
                            {latestMonth.year}
                          </span>
                          <span>·</span>
                          <span className="text-bone">
                            {$(latestMonth.report.spend)}/mo
                          </span>
                          {latestMonth.report.savings > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-mono font-bold text-moss-light">
                                {$(latestMonth.report.savings)} recoverable
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span>
                            {latestMonth.report.findings.length} findings
                          </span>
                          {latestMonth.timestamp && (
                            <>
                              <span>·</span>
                              <span
                                title={new Date(
                                  latestMonth.timestamp
                                ).toLocaleString()}
                              >
                                analyzed {relativeTime(latestMonth.timestamp)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={(e) => handleDelete(analysis.id, e)}
                          className="text-xs text-bone-subtle hover:text-critical transition-colors cursor-pointer leading-none"
                        >
                          Clear
                        </button>
                        <svg
                          className="w-4 h-4 text-bone-subtle group-hover:text-bone transition-colors shrink-0"
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
