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
import { demoAnthropic, demoOpenAI } from "@/lib/demo";
import type { Report } from "@/types";
import Footer from "@/components/Footer";
import { FadeUp } from "@/components/motion/FadeUp";
import { StaggerChildren } from "@/components/motion/StaggerChildren";
import { MagneticButton } from "@/components/motion/MagneticButton";
import { Marquee } from "@/components/Marquee";

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
    } catch (x: unknown) {
      const errorMsg =
        x instanceof Error ? x.message : "An unexpected error occurred";
      setErr(errorMsg);
      setIsAnalyzing(false);
    }
  };

  const startDemo = async () => {
    setErr("");
    setIsAnalyzing(true);
    setStep("Generating sample data...");

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const id = generateId();

      if (vendor === Vendor.OPENAI) {
        setStep("Simulating OpenAI usage...");
        const d = demoOpenAI(year, month);

        const rows = aggOpenAI(d.usage);
        const findings = findIssuesOpenAI(rows, d.projects);

        let spend = 0;
        if (d.costs && d.costs.data.length > 0) {
          for (const bucket of d.costs.data) {
            for (const result of bucket.results) {
              spend += result.amount.value;
            }
          }
        } else {
          for (const row of rows) {
            spend += tcOpenAI(row.model, row.inp, row.out);
          }
        }

        let ti = 0,
          to = 0;
        for (const row of rows) {
          ti += row.inp;
          to += row.out;
        }

        const projectSpend: Record<string, { id: string; spend: number }> = {};
        const projectNames: Record<string, string> = {};
        (d.projects || []).forEach((p) => {
          projectSpend[p.id] = { id: p.id, spend: 0 };
          projectNames[p.id] = p.name || p.id;
        });
        if (d.costs && d.costs.data.length > 0) {
          for (const bucket of d.costs.data) {
            for (const result of bucket.results) {
              const pid = result.project_id || "default";
              if (!projectSpend[pid]) {
                projectSpend[pid] = { id: pid, spend: 0 };
                projectNames[pid] = result.project_name || pid;
              }
              projectSpend[pid].spend += result.amount.value;
            }
          }
        }
        const wss = Object.values(projectSpend)
          .map((p) => ({ ...p, name: projectNames[p.id] || p.id }))
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 10);

        const report: Report = {
          org: d.org,
          spend,
          savings: findings.reduce((s, f) => s + f.sav, 0),
          tokens: ti + to,
          findings,
          wss,
          keys: rows.length,
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

        router.push(
          `/history/${id}/recommendations?year=${year}&month=${month}`
        );
        return;
      }

      setStep("Simulating Anthropic usage...");
      const d = demoAnthropic(year, month);

      const bk = agg(d.bk);
      const bm = agg(d.bm);
      const src = bk.length ? bk : bm;
      const findings = findIssues(
        src,
        d.ws,
        d.rawBk.length ? d.rawBk : d.rawBm
      );

      let spend = 0,
        ti = 0,
        to = 0;
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

      router.push(`/history/${id}/recommendations?year=${year}&month=${month}`);
    } catch (x: unknown) {
      const errorMsg =
        x instanceof Error ? x.message : "Demo generation failed";
      setErr(errorMsg);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-bone font-sans flex flex-col">
      <Header currentPage="home" showNewReport={false} />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        {!isAnalyzing ? (
          <div className="flex flex-col items-center text-center pt-16 pb-16">
            {/* Hero headline */}
            <FadeUp>
              <h1 className="font-display text-5xl sm:text-7xl font-bold text-bone text-center leading-none tracking-[-0.04em]">
                Spend less.
                <br />
                <span className="text-bone bg-moss px-2">Ship more.</span>
              </h1>
            </FadeUp>
            <FadeUp delay={0.1}>
              <p className="mt-6 text-bone-muted max-w-md text-center text-base leading-relaxed font-sans">
                Connect your Admin API key. TokenPilot surfaces dollar-accurate
                optimization opportunities with confidence scores — in under 60
                seconds.
              </p>
            </FadeUp>

            {/* Marquee ticker */}
            <div className="w-full overflow-hidden border-y border-ink-border my-8 py-3">
              <Marquee className="text-xs font-mono text-bone-subtle">
                {[
                  "Claude Opus 4.7 · $15/MTok input",
                  "Claude Sonnet 4.6 · $3/MTok input",
                  "Claude Haiku 4.5 · $0.80/MTok input",
                  "GPT-4o · $2.50/MTok input",
                  "GPT-4o mini · $0.15/MTok input",
                  "o3 · $10/MTok input",
                  "Batch API · 50% discount",
                  "Prompt caching · 90% discount on cache reads",
                ].map((item, i) => (
                  <span key={i} className="mx-8">
                    {item} ·
                  </span>
                ))}
              </Marquee>
            </div>

            {/* Form: vendor selector + input */}
            <FadeUp delay={0.2}>
              <div className="flex flex-col items-center w-full max-w-lg">
                {/* Vendor Selector */}
                <div className="flex gap-1 p-1 rounded-sm bg-ink-elevated border border-ink-border mb-6">
                  <button
                    onClick={() => handleVendorChange(Vendor.ANTHROPIC)}
                    className={`px-6 py-2 text-sm font-medium rounded-sm transition-all cursor-pointer ${
                      vendor === Vendor.ANTHROPIC
                        ? "bg-ink-border text-bone"
                        : "text-bone-subtle hover:text-bone"
                    }`}
                  >
                    Anthropic
                  </button>
                  <button
                    onClick={() => handleVendorChange(Vendor.OPENAI)}
                    className={`px-6 py-2 text-sm font-medium rounded-sm transition-all cursor-pointer ${
                      vendor === Vendor.OPENAI
                        ? "bg-ink-border text-bone"
                        : "text-bone-subtle hover:text-bone"
                    }`}
                  >
                    OpenAI
                  </button>
                </div>

                {/* API key input + Analyze button */}
                <div className="mt-0 flex gap-2 w-full max-w-lg">
                  <label htmlFor="api-key-input" className="sr-only">
                    {vendor === Vendor.OPENAI
                      ? "OpenAI Admin API Key"
                      : "Anthropic Admin API Key"}
                  </label>
                  <input
                    id="api-key-input"
                    ref={inputRef}
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startAnalysis()}
                    placeholder={
                      vendor === Vendor.OPENAI
                        ? "sk-admin-..."
                        : "sk-ant-admin-..."
                    }
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                    className="flex-1 rounded-sm border border-ink-border bg-ink-elevated px-4 py-2.5 text-sm font-mono text-bone placeholder-bone-subtle focus:border-moss/50 focus:ring-1 focus:ring-moss/30 outline-none transition"
                  />
                  <MagneticButton>
                    <button
                      id="analyze-btn"
                      onClick={startAnalysis}
                      className="rounded-sm bg-moss px-6 py-2.5 text-sm font-medium text-bone hover:bg-moss-light transition-colors cursor-pointer"
                    >
                      Analyze →
                    </button>
                  </MagneticButton>
                </div>

                {/* Key creation help text */}
                <p className="mt-3 text-[11px] text-bone-subtle font-mono">
                  {vendor === Vendor.OPENAI
                    ? "Platform → Settings → Admin Keys → Create new admin key (read-only)"
                    : "Console → API Keys → Admin Keys → Create admin key (read-only)"}
                </p>

                {/* Demo mode */}
                <div className="mt-4 flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-ink-border" />
                  <span className="text-[11px] text-bone-subtle font-mono shrink-0">
                    or
                  </span>
                  <div className="flex-1 h-px bg-ink-border" />
                </div>
                <button
                  onClick={startDemo}
                  className="mt-3 w-full rounded-sm border border-ink-border bg-ink-elevated px-4 py-2.5 text-sm text-bone-muted hover:text-bone hover:border-moss/40 transition-colors cursor-pointer font-sans"
                >
                  Try with sample data →
                </button>

                {/* Error display */}
                {err && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="mt-6 w-full max-w-lg rounded-sm border border-critical/30 bg-critical/5 p-4 text-left"
                  >
                    <p className="text-xs font-semibold mb-1 text-critical">
                      Connection error
                    </p>
                    <p className="text-xs text-bone-muted font-mono break-all">
                      {err}
                    </p>
                  </div>
                )}
              </div>
            </FadeUp>

            {/* Feature cards */}
            <StaggerChildren className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 w-full max-w-2xl">
              {[
                {
                  t: "Find hidden waste in 60 seconds",
                  d: "Instantly identifies overpriced models, bloated RAG contexts, missing cache configs, and batch API opportunities most teams miss.",
                },
                {
                  t: "Smart recommendations, not guesses",
                  d: "Weighted confidence scoring analyzes 5+ signals per finding. Only shows optimizations proven to work across production workloads.",
                },
                {
                  t: "Real savings, conservative estimates",
                  d: "Calculated from your actual token volumes, not theoretical benchmarks. High-confidence wins highlighted first.",
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="rounded-sm border border-ink-border bg-ink-elevated p-5"
                >
                  <h3 className="text-sm font-semibold text-bone font-sans">
                    {f.t}
                  </h3>
                  <p className="mt-1.5 text-xs text-bone-subtle leading-relaxed font-sans">
                    {f.d}
                  </p>
                </div>
              ))}
            </StaggerChildren>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-24 w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-5 h-5 border-2 border-moss/30 border-t-moss rounded-full animate-spin shrink-0" />
              <p className="text-sm text-bone font-medium">
                {step || "Connecting..."}
              </p>
            </div>
            <p className="text-xs text-bone-subtle mb-8 font-mono">
              {vendor === Vendor.OPENAI
                ? "OpenAI Platform API · Read-only"
                : "Anthropic Admin API · Read-only"}
            </p>
            {/* Skeleton recommendation rows */}
            <div className="w-full space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-ink-border bg-ink-elevated px-5 py-4 flex items-center gap-4"
                  style={{ opacity: 1 - i * 0.2 }}
                >
                  <div className="w-5 h-3 bg-ink-border rounded animate-pulse shrink-0" />
                  <div className="w-14 h-5 bg-ink-border rounded animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className="h-4 bg-ink-border rounded animate-pulse"
                      style={{ width: `${60 + i * 12}%` }}
                    />
                    <div className="h-3 bg-ink-border rounded animate-pulse w-1/2" />
                  </div>
                  <div className="w-16 h-6 bg-ink-border rounded animate-pulse shrink-0" />
                </div>
              ))}
            </div>
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-ink">
          <div className="w-8 h-8 border-2 border-moss/30 border-t-moss rounded-full animate-spin mb-6" />
          <p className="text-sm text-bone font-medium">Loading...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
