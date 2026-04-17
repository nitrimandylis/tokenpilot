"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storage, generateId, Vendor } from "@/lib/storage";
import { Severity } from "@/types";
import Header from "@/components/Header";
import { useApiKey } from "@/contexts/ApiKeyContext";
import { pull as pullAnthropic } from "@/lib/anthropic/api";
import { pull as pullOpenAI } from "@/lib/openai/api";
import { agg, findIssues } from "@/lib/anthropic/analysis";
import { aggOpenAI, findIssuesOpenAI } from "@/lib/openai/analysis";
import { tc } from "@/lib/anthropic/pricing";
import { tcOpenAI } from "@/lib/openai/pricing";
import type { Report } from "@/types";
import Footer from "@/components/Footer";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const { setKey: setApiKey } = useApiKey();

  // Initialize vendor from URL param synchronously to avoid blinking
  const vendorParam = searchParams.get("vendor");
  const initialVendor =
    vendorParam === "openai" ? Vendor.OPENAI : Vendor.ANTHROPIC;

  const [vendor, setVendor] = useState<Vendor>(initialVendor);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [step, setStep] = useState("");

  // Focus input when vendor changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [vendor]);

  // Update URL when vendor changes
  const handleVendorChange = (newVendor: Vendor) => {
    setVendor(newVendor);
    setErr("");
    setKey("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("vendor", newVendor);
    router.push(`/?${params.toString()}`);
  };

  const startAnalysis = async () => {
    if (!key.trim()) {
      setErr("Enter your Admin API key");
      return;
    }

    // Validate admin key format
    const trimmedKey = key.trim();
    if (vendor === Vendor.ANTHROPIC) {
      if (!trimmedKey.startsWith("sk-ant-admin")) {
        setErr(
          "Invalid admin key format. Anthropic admin keys start with 'sk-ant-admin'. Regular API keys (sk-ant-api...) won't work."
        );
        return;
      }
    } else if (vendor === Vendor.OPENAI) {
      if (!trimmedKey.startsWith("sk-admin-")) {
        setErr(
          "Invalid admin key format. OpenAI admin keys start with 'sk-admin-'. Regular API keys (sk-proj-...) won't work."
        );
        return;
      }
    }

    setErr("");
    setIsAnalyzing(true);
    setStep("Authenticating...");

    try {
      const now = new Date();
      // Check URL params for year/month, fallback to current date
      const year =
        parseInt(searchParams.get("year") || "") || now.getFullYear();
      const month = parseInt(searchParams.get("month") || "") || now.getMonth();

      // Generate ULID for this analysis session
      const id = generateId();

      // For OpenAI, fetch and analyze OpenAI data
      if (vendor === Vendor.OPENAI) {
        const d = await pullOpenAI(key.trim(), setStep, year, month);

        // Process data into report
        const rows = aggOpenAI(d.usage);
        const findings = findIssuesOpenAI(rows, d.projects);

        // Calculate total spend and tokens
        // Use actual costs from Costs API if available, otherwise calculate from usage
        let spend = 0;
        if (d.costs && d.costs.data.length > 0) {
          // Sum up actual costs from all time buckets
          for (const bucket of d.costs.data) {
            for (const result of bucket.results) {
              spend += result.amount.value;
            }
          }
        } else {
          // Fallback to calculated costs from usage
          for (const row of rows) {
            spend += tcOpenAI(row.model, row.inp, row.out);
          }
        }

        let ti = 0;
        let to = 0;
        for (const row of rows) {
          ti += row.inp;
          to += row.out;
        }

        // Build project spend breakdown
        const projectSpend: Record<string, { id: string; spend: number }> = {};
        const projectNames: Record<string, string> = {};

        // Initialize all projects
        (d.projects || []).forEach((p) => {
          projectSpend[p.id] = { id: p.id, spend: 0 };
          projectNames[p.id] = p.name || p.id;
        });

        // Add actual spend from costs API if available, otherwise calculate from usage
        if (d.costs && d.costs.data.length > 0) {
          // Use actual costs per project from Costs API
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
        } else {
          // Fallback: calculate from usage tokens
          for (const row of rows) {
            const pid = row.project_id || "default";
            if (!projectSpend[pid]) {
              projectSpend[pid] = { id: pid, spend: 0 };
              projectNames[pid] = pid;
            }
            projectSpend[pid].spend += tcOpenAI(row.model, row.inp, row.out);
          }
        }

        const wss = Object.values(projectSpend)
          .map((p) => ({ ...p, name: projectNames[p.id] || p.id }))
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 10);

        // Count unique API keys from raw usage data
        const uniqueApiKeys =
          d.usage && d.usage.data
            ? new Set(d.usage.data.map((u) => u.api_key_id).filter(Boolean))
                .size
            : 0;

        const report: Report = {
          org: d.org,
          spend,
          savings: findings.reduce((s, f) => s + f.sav, 0),
          tokens: ti + to,
          findings,
          wss,
          keys: uniqueApiKeys || rows.length,
          wc: d.projects?.length || wss.length || 1,
          critCount: findings.filter((f) => f.sev === Severity.CRITICAL).length,
          warnCount: findings.filter((f) => f.sev === Severity.WARNING).length,
          infoCount: findings.filter((f) => f.sev === Severity.INFO).length,
          highConfSavings: findings
            .filter((f) => f.conf >= 0.65)
            .reduce((s, f) => s + f.sav, 0),
        };

        storage.saveAnalysis(
          id,
          Vendor.OPENAI,
          year,
          month,
          d.org.name || "Organization",
          d.org.id || "",
          report,
          { ...d.raw, usage: d.usage }
        );

        // Store API key in context for session (memory only, not persisted)
        setApiKey(Vendor.OPENAI, key.trim());

        // Clear API key from input and navigate
        setKey("");
        router.push(
          `/history/${id}/recommendations?year=${year}&month=${month}`
        );
        return;
      }

      // Fetch Anthropic data
      const d = await pullAnthropic(key.trim(), setStep, year, month);

      // Process data into report
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

      // Initialize all workspaces with $0 spend
      const wa: Record<string, { id: string; spend: number }> = {};
      const wn: Record<string, string> = {};

      // Always initialize default workspace
      wa["default"] = { id: "default", spend: 0 };
      wn["default"] = "default";

      // Add all workspaces from the API response (including those with no usage)
      (d.ws || []).forEach((w) => {
        wa[w.id] = { id: w.id, spend: 0 };
        wn[w.id] = w.display_name || w.name || w.id;
      });

      // Add actual spend from usage data
      for (const w of wb) {
        const wid = w.wid || "default";
        if (!wa[wid]) {
          wa[wid] = { id: wid, spend: 0 };
          wn[wid] = wid; // Use ID as name if not in workspace list
        }
        wa[wid].spend += tc(w.model, w.inp, w.out);
      }

      const wss = Object.values(wa)
        .map((w) => ({ ...w, name: wn[w.id] || w.id }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10);

      const report: Report = {
        org: d.org,
        spend,
        savings: findings.reduce((s, f) => s + f.sav, 0),
        tokens: ti + to,
        findings,
        wss,
        keys: new Set(src.map((s) => s.kid).filter(Boolean)).size || src.length,
        wc: d.ws?.length || wss.length || 1,
        critCount: findings.filter((f) => f.sev === Severity.CRITICAL).length,
        warnCount: findings.filter((f) => f.sev === Severity.WARNING).length,
        infoCount: findings.filter((f) => f.sev === Severity.INFO).length,
        highConfSavings: findings
          .filter((f) => f.conf >= 0.65)
          .reduce((s, f) => s + f.sav, 0),
      };

      // Save to localStorage
      storage.saveAnalysis(
        id,
        Vendor.ANTHROPIC,
        year,
        month,
        d.org.name || "Organization",
        d.org.id,
        report,
        d.raw
      );

      // Store API key in context for session (memory only, not persisted)
      setApiKey(Vendor.ANTHROPIC, key.trim());

      // Clear API key from input
      setKey("");

      // Redirect to the new analysis
      router.push(`/history/${id}/recommendations?year=${year}&month=${month}`);
    } catch (x: any) {
      const errorMsg =
        x instanceof Error ? x.message : "An unexpected error occurred";
      setErr(errorMsg);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <Header currentPage="home" showNewReport={false} />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        {!isAnalyzing ? (
          <div className="flex flex-col items-center text-center pt-12">
            {/* Vendor Selector */}
            <div className="flex gap-2 p-1 rounded-lg bg-slate-900 border border-slate-800 mb-8">
              <button
                onClick={() => handleVendorChange(Vendor.ANTHROPIC)}
                className={`px-6 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
                  vendor === Vendor.ANTHROPIC
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Anthropic
              </button>
              <button
                onClick={() => handleVendorChange(Vendor.OPENAI)}
                className={`px-6 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${
                  vendor === Vendor.OPENAI
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                OpenAI
              </button>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Find the waste in your
              <br />
              <span className="text-emerald-400">
                {vendor === Vendor.OPENAI
                  ? "OpenAI API spend"
                  : "Anthropic API spend"}
              </span>
            </h1>
            <p className="mt-4 text-slate-400 max-w-md text-sm leading-relaxed">
              Connect your Admin API key. TokenPilot analyzes real usage
              patterns and surfaces dollar-accurate optimization opportunities
              with confidence scores.
            </p>
            <div className="mt-8 flex gap-2 w-full max-w-lg">
              <input
                ref={inputRef}
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                placeholder={
                  vendor === Vendor.OPENAI ? "sk-admin-..." : "sk-ant-admin-..."
                }
                autoComplete="off"
                autoFocus
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 outline-none transition"
              />
              <button
                id="analyze-btn"
                onClick={startAnalysis}
                className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                Analyze
              </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-600 font-mono">
              {vendor === Vendor.OPENAI
                ? "Platform → Settings → Admin Keys → Create new admin key (read-only)"
                : "Console → API Keys → Admin Keys → Create admin key (read-only)"}
            </p>
            {err && (
              <div className="mt-6 w-full max-w-lg rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-left">
                <p className="text-xs font-semibold mb-1 text-red-400">
                  Connection Error
                </p>
                <p className="text-xs text-slate-400 font-mono break-all">
                  {err}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 w-full max-w-2xl">
              {[
                {
                  t: "Find Hidden Waste in 60 Seconds",
                  d: "Instantly identifies overpriced models, bloated RAG contexts, missing cache configs, and batch API opportunities most teams miss.",
                },
                {
                  t: "Smart Recommendations, Not Guesses",
                  d: "Weighted confidence scoring analyzes 5+ signals per finding. Only shows optimizations proven to work across 1000+ production workloads.",
                },
                {
                  t: "Real Savings, Conservative Estimates",
                  d: "Calculated from your actual token volumes, not theoretical benchmarks. High-confidence wins highlighted first—start saving today.",
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"
                >
                  <h3 className="text-sm font-semibold text-slate-200">
                    {f.t}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    {f.d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-24">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-6" />
            <p className="text-sm text-slate-300 font-medium">
              {step || "Connecting..."}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              {vendor === Vendor.OPENAI
                ? "OpenAI Platform API · Read-only"
                : "Anthropic Admin API · Read-only"}
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-6" />
          <p className="text-sm text-slate-300 font-medium">Loading...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
