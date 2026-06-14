"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

interface RawEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  litellm_provider?: string;
}

interface ModelRow {
  id: string;
  provider: "anthropic" | "openai";
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  context?: number;
  maxOut?: number;
}

type SortKey = "id" | "input" | "output" | "context";
type VendorTab = "all" | "anthropic" | "openai";

function fmtTokens(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return `${Math.round(n / 1000)}K`;
}

function fmtPrice(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span
      className={`ml-1 text-[10px] ${active ? "text-moss" : "text-bone-subtle/40"}`}
    >
      {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
    </span>
  );
}

export default function PricingPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<VendorTab>("all");
  const [sort, setSort] = useState<SortKey>("input");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch(LITELLM_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Record<string, RawEntry>) => {
        const rows: ModelRow[] = [];
        for (const [id, m] of Object.entries(data)) {
          const p = m.litellm_provider;
          if (p !== "anthropic" && p !== "openai") continue;
          if (!m.input_cost_per_token && !m.output_cost_per_token) continue;
          const input = (m.input_cost_per_token ?? 0) * 1_000_000;
          const output = (m.output_cost_per_token ?? 0) * 1_000_000;
          if (input === 0 && output === 0) continue;
          rows.push({
            id,
            provider: p as "anthropic" | "openai",
            input,
            output,
            cacheRead: m.cache_read_input_token_cost
              ? m.cache_read_input_token_cost * 1_000_000
              : undefined,
            cacheWrite: m.cache_creation_input_token_cost
              ? m.cache_creation_input_token_cost * 1_000_000
              : undefined,
            context: m.max_input_tokens,
            maxOut: m.max_output_tokens,
          });
        }
        setModels(rows);
        setFetchedAt(new Date().toLocaleTimeString());
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sort === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSort(key);
        setSortDir("desc");
      }
    },
    [sort]
  );

  const filtered = models
    .filter((m) => {
      if (vendor !== "all" && m.provider !== vendor) return false;
      if (search && !m.id.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sort === "id") return mul * a.id.localeCompare(b.id);
      if (sort === "input") return mul * (a.input - b.input);
      if (sort === "output") return mul * (a.output - b.output);
      if (sort === "context")
        return mul * ((a.context ?? 0) - (b.context ?? 0));
      return 0;
    });

  const anthropicCount = models.filter(
    (m) => m.provider === "anthropic"
  ).length;
  const openaiCount = models.filter((m) => m.provider === "openai").length;

  return (
    <div className="min-h-screen bg-ink text-bone font-sans flex flex-col">
      <Header currentPage="pricing" />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-10 w-full">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold font-display text-bone tracking-tight mb-1">
            Model Pricing
          </h1>
          <p className="text-sm text-bone-subtle">
            Live data from{" "}
            <a
              href="https://github.com/BerriAI/litellm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-moss hover:text-moss-light transition-colors underline underline-offset-2"
            >
              LiteLLM
            </a>
            {fetchedAt && (
              <span className="text-bone-subtle/50">
                {" "}
                · fetched at {fetchedAt}
              </span>
            )}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <input
            type="text"
            placeholder="Search models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-sm border border-ink-border bg-ink-elevated px-4 py-2 text-sm font-mono text-bone placeholder-bone-subtle focus:border-moss/50 focus:ring-1 focus:ring-moss/30 outline-none transition"
          />
          {/* Vendor tabs */}
          <div className="flex gap-1 p-1 rounded-sm bg-ink-elevated border border-ink-border shrink-0">
            {(["all", "anthropic", "openai"] as VendorTab[]).map((v) => (
              <button
                key={v}
                onClick={() => setVendor(v)}
                className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-all cursor-pointer ${
                  vendor === v
                    ? "bg-ink-border text-bone"
                    : "text-bone-subtle hover:text-bone"
                }`}
              >
                {v === "all"
                  ? `All (${models.length})`
                  : v === "anthropic"
                    ? `Anthropic (${anthropicCount})`
                    : `OpenAI (${openaiCount})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-ink-border bg-ink-elevated/40 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 rounded-lg bg-ink-border/40 animate-pulse"
                  style={{ opacity: 1 - i * 0.1 }}
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-400 mb-1">
                Failed to load pricing
              </p>
              <p className="text-xs text-bone-subtle">{error}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-border">
                    <th
                      className="text-left px-4 py-3 text-[10px] font-bold text-bone-subtle tracking-wider cursor-pointer hover:text-bone select-none"
                      onClick={() => handleSort("id")}
                    >
                      MODEL <SortIcon active={sort === "id"} dir={sortDir} />
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[10px] font-bold text-bone-subtle tracking-wider cursor-pointer hover:text-bone select-none whitespace-nowrap"
                      onClick={() => handleSort("input")}
                    >
                      INPUT / MTok{" "}
                      <SortIcon active={sort === "input"} dir={sortDir} />
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[10px] font-bold text-bone-subtle tracking-wider cursor-pointer hover:text-bone select-none whitespace-nowrap"
                      onClick={() => handleSort("output")}
                    >
                      OUTPUT / MTok{" "}
                      <SortIcon active={sort === "output"} dir={sortDir} />
                    </th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-bone-subtle tracking-wider whitespace-nowrap">
                      CACHE READ
                    </th>
                    <th
                      className="text-right px-4 py-3 text-[10px] font-bold text-bone-subtle tracking-wider cursor-pointer hover:text-bone select-none"
                      onClick={() => handleSort("context")}
                    >
                      CONTEXT{" "}
                      <SortIcon active={sort === "context"} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-bone-subtle"
                      >
                        No models match
                      </td>
                    </tr>
                  ) : (
                    filtered.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-ink-border/40 hover:bg-ink-border/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                m.provider === "anthropic"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-blue-500/15 text-blue-400"
                              }`}
                            >
                              {m.provider === "anthropic" ? "ANT" : "OAI"}
                            </span>
                            <span className="font-mono text-bone">{m.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-bone">
                          {fmtPrice(m.input)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-bone">
                          {fmtPrice(m.output)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-bone-subtle">
                          {m.cacheRead !== undefined
                            ? fmtPrice(m.cacheRead)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-bone-subtle">
                          {fmtTokens(m.context)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && (
          <p className="text-[10px] text-bone-subtle/40 mt-3 text-right">
            {filtered.length} models · prices in USD per million tokens
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
