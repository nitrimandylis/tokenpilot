"use client";

import type { Finding } from "@/types";
import { AnthropicCategory, OpenAICategory, Severity } from "@/types/analysis";
import { Vendor } from "@/lib/storage";
import Pill from "./Pill";
import ConfBar from "./ConfBar";
import { $, T } from "@/lib/formatters";
import ReactMarkdown from "react-markdown";

interface RowProps {
  f: Finding;
  open: boolean;
  toggle: () => void;
  vendor: Vendor;
  index: number;
}

function Row({ f, open, toggle, vendor, index }: RowProps) {
  const isAnthropic = vendor === Vendor.ANTHROPIC;
  const isOpenAI = vendor === Vendor.OPENAI;

  return (
    <div
      className={`rounded-lg border border-ink-border bg-ink-elevated ${
        f.sev === Severity.CRITICAL
          ? "border-critical/30"
          : f.sev === Severity.WARNING
            ? "border-warning/20"
            : "border-ink-border"
      }`}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#1F1916] rounded-lg cursor-pointer transition-colors"
      >
        {/* Index */}
        <span className="font-mono text-xs text-bone-subtle shrink-0 w-5">
          {String(index).padStart(2, "0")}
        </span>

        {/* Pill */}
        <div className="shrink-0">
          <Pill s={f.sev} />
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <span
            className="font-display font-semibold text-[19px] text-bone block truncate"
            style={{ letterSpacing: "-0.03em" }}
          >
            {f.name}
          </span>
          <p className="text-xs text-bone-subtle mt-0.5 font-sans">
            {f.cat} · {f.ws} · {f.ml}
          </p>
        </div>

        {/* Confidence bar */}
        <div className="hidden sm:block min-w-[80px] shrink-0">
          <p className="text-xs text-bone-subtle mb-1">Confidence</p>
          <ConfBar value={f.conf} />
        </div>

        {/* Savings */}
        <div className="text-right shrink-0 min-w-[80px]">
          <span className="font-mono text-xl font-bold text-moss-light">
            {f.sav > 0 ? $(f.sav) : "—"}
          </span>
          {f.sav > 0 && <span className="text-bone-subtle text-xs">/mo</span>}
        </div>

        {/* Chevron */}
        <div className="shrink-0 flex items-center justify-center w-4">
          <svg
            className={`w-4 h-4 text-bone-subtle transition-transform ${
              open ? "rotate-180" : ""
            }`}
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
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-ink-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
            {/* Left: Usage Metrics */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-bone-subtle mb-3">
                Usage (30d)
              </h4>
              {[
                ["Requests", f.reqs.toLocaleString()],
                ["Input tokens", T(f.inp)],
                ["Output tokens", T(f.out)],
                ["Cached input", T(f.cached)],
                [
                  "Avg input/req",
                  `${f.ai.toLocaleString()} tok`,
                  f.ai > 8000 ? "text-warning" : "",
                ],
                [
                  "Avg output/req",
                  `${f.ao} tok`,
                  f.ao > 0 && f.ao < 150 ? "text-warning" : "",
                ],
                [
                  "In:Out ratio",
                  `${f.ratio.toFixed(1)}:1`,
                  f.ratio > 15 ? "text-critical" : "",
                ],
                [
                  "Cache rate",
                  `${(f.cr * 100).toFixed(1)}%`,
                  f.cr < 0.05 && f.inp > 10e6
                    ? "text-critical"
                    : "text-moss-light",
                ],
                ["Active days", `${f.activeDays}/30`],
              ].map(([l, v, c], i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-bone-subtle">{l}</span>
                  <span className={`font-mono font-medium ${c || "text-bone"}`}>
                    {v}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: Finding + Action Combined */}
            <div className="md:col-span-2 space-y-4">
              {/* Cost header */}
              <div className="text-sm text-bone-muted">
                Currently spending{" "}
                <span className="font-bold text-bone">{$(f.cur)}/mo</span> on
                this pattern
              </div>

              {/* Solution sections */}
              <div className="space-y-3">
                {/* ========== ANTHROPIC SOLUTIONS ========== */}
                {isAnthropic &&
                  f.cat === AnthropicCategory.RAG_OPTIMIZATION && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Reduce Retrieval Chunks
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        High input:output ratio of {f.ratio.toFixed(0)}:1 across{" "}
                        {(f.inp / 1e6).toFixed(1)}M input tokens — your RAG
                        system is pulling too many document chunks per request.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Passing 10+ chunks (~800 tokens each)
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`# Retrieving too many chunks
chunks = vector_db.search(query, top_k=15)
context = "\\n".join([c.text for c in chunks])  # ~12K tokens

client.messages.create(
  model="claude-sonnet-4-20250514",
  messages=[{"role": "user", "content": f"{context}\\n{query}"}]
)`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Rerank + limit to 3-5 best chunks
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`# Add reranking, reduce chunks
chunks = vector_db.search(query, top_k=15)
reranked = reranker.rank(query, chunks)[:3]  # Keep top 3
context = "\\n".join([c.text for c in reranked])  # ~2.4K tokens

client.messages.create(
  model="claude-sonnet-4-20250514",
  messages=[{"role": "user", "content": f"{context}\\n{query}"}]
)
# 80% fewer input tokens → 80% cost reduction`}
                      </pre>
                    </div>
                  )}

                {isAnthropic &&
                  f.cat === AnthropicCategory.MODEL_DOWNGRADE_HAIKU && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Switch to Haiku Model
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        Short outputs ({f.ao} tokens avg) suggest simple tasks —
                        Haiku handles these at 95% lower cost.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Using {f.ml} for simple tasks
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`message = client.messages.create(
  model="${f.model}",
  max_tokens=1024,
  messages=[{"role": "user", "content": prompt}]
)`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Switch to Haiku ($0.25/$1.25 per 1M tokens)
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`message = client.messages.create(
  model="claude-haiku-4-5-20251022",  # Changed
  max_tokens=1024,
  messages=[{"role": "user", "content": prompt}]
)
# 95% cost reduction for classification/routing/extraction`}
                      </pre>
                    </div>
                  )}

                {isAnthropic &&
                  f.cat === AnthropicCategory.MODEL_DOWNGRADE_SONNET && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Switch to Sonnet Model
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        You're using {f.ml} when Sonnet would work fine for this
                        task — save 80% with minimal quality difference.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Using Opus ($15/$75 per 1M tokens)
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`message = client.messages.create(
  model="claude-opus-4-20250514",
  max_tokens=1024,
  messages=[{"role": "user", "content": prompt}]
)`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Switch to Sonnet ($3/$15 per 1M tokens)
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`message = client.messages.create(
  model="claude-sonnet-4-20250514",  # Changed
  max_tokens=1024,
  messages=[{"role": "user", "content": prompt}]
)
# 80% cost reduction, minimal quality loss for RAG tasks`}
                      </pre>
                    </div>
                  )}

                {isAnthropic && f.cat === AnthropicCategory.PROMPT_CACHING && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Enable Prompt Caching
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      {(f.cr * 100).toFixed(0)}% cache rate on{" "}
                      {(f.inp / 1e6).toFixed(1)}M tokens — you're paying full
                      price for repeated content.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: No caching (full price on repeated content)
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`message = client.messages.create(
  model="claude-sonnet-4-20250514",
  system="Long system prompt...",
  messages=[{"role": "user", "content": docs + query}]
)`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Add cache_control to static content
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`message = client.messages.create(
  model="claude-sonnet-4-20250514",
  system=[
    {"type": "text", "text": "Long system prompt...",
     "cache_control": {"type": "ephemeral"}}
  ],
  messages=[{
    "role": "user",
    "content": [
      {"type": "text", "text": docs,
       "cache_control": {"type": "ephemeral"}},
      {"type": "text", "text": query}
    ]
  }]
)
# 90% off cached tokens after first request`}
                    </pre>
                  </div>
                )}

                {isAnthropic &&
                  f.cat === AnthropicCategory.BATCH_API_MIGRATION && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Use Batch API
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        Bursty traffic pattern — this workload could run async
                        at 50% off using the Batch API.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Real-time Messages API (full price)
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`for item in dataset:
  response = client.messages.create(
    model="claude-sonnet-4-20250514",
    messages=[{"role": "user", "content": item}]
  )
  results.append(response)`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Message Batches API (50% off, 24hr results)
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`batch = client.messages.batches.create(
  requests=[{
    "custom_id": f"req-{i}",
    "params": {
      "model": "claude-sonnet-4-20250514",
      "messages": [{"role": "user", "content": item}]
    }
  } for i, item in enumerate(dataset)]
)
# Poll: results = client.messages.batches.retrieve(batch.id)
# 50% cost reduction for async workloads`}
                      </pre>
                    </div>
                  )}

                {/* ========== OPENAI SOLUTIONS ========== */}
                {isOpenAI && f.cat === OpenAICategory.PROMPT_CACHING && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Enable Prompt Caching
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Large avg input (~{f.ai.toLocaleString()} tok/req) across{" "}
                      {f.reqs.toLocaleString()} requests — OpenAI supports
                      prompt caching to reduce costs on repeated content.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: No caching (full price on repeated prompts)
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`response = openai.chat.completions.create(
  model="${f.model}",
  messages=[
    {"role": "system", "content": long_system_prompt},
    {"role": "user", "content": docs + query}
  ]
)`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Enable prompt caching on system messages
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`# Cached prompts reduce cost by 50% on cache reads
# Cache lasts 5-60min depending on model
response = openai.chat.completions.create(
  model="${f.model}",
  messages=[
    {"role": "system", "content": long_system_prompt},
    {"role": "user", "content": docs + query}
  ]
)
# Automatic caching when prompts exceed 1024 tokens`}
                    </pre>
                  </div>
                )}

                {isOpenAI && f.cat === OpenAICategory.MODEL_DOWNGRADE_MINI && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Switch to GPT-4o-mini
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Pattern shows avg {f.ao} tok output — GPT-4o-mini handles
                      these tasks at ~95% lower cost than {f.ml}.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: Using {f.ml}
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`response = openai.chat.completions.create(
  model="${f.model}",
  messages=[{"role": "user", "content": prompt}]
)`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Switch to GPT-4o-mini ($0.15/$0.60 per 1M tokens)
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`response = openai.chat.completions.create(
  model="gpt-4o-mini",  # Changed
  messages=[{"role": "user", "content": prompt}]
)
# ~95% cost reduction for simple tasks`}
                    </pre>
                  </div>
                )}

                {isOpenAI && f.cat === OpenAICategory.RAG_OPTIMIZATION && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Optimize RAG Context
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Input:output ratio of {f.ratio.toFixed(0)}:1 suggests
                      you're passing too many document chunks per request.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: Passing many chunks
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`chunks = vector_db.search(query, top_k=15)
context = "\\n".join([c.text for c in chunks])  # Large context

response = openai.chat.completions.create(
  model="${f.model}",
  messages=[{"role": "user", "content": f"{context}\\n{query}"}]
)`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Rerank and reduce chunks
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`chunks = vector_db.search(query, top_k=15)
reranked = reranker.rank(query, chunks)[:3]  # Keep top 3
context = "\\n".join([c.text for c in reranked])

response = openai.chat.completions.create(
  model="${f.model}",
  messages=[{"role": "user", "content": f"{context}\\n{query}"}]
)
# 70-80% fewer input tokens`}
                    </pre>
                  </div>
                )}

                {isOpenAI && f.cat === OpenAICategory.BATCH_API_MIGRATION && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Use Batch API
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Bursty traffic pattern detected — Batch API offers 50%
                      discount for async requests with 24hr turnaround.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: Real-time API (full price)
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`for item in dataset:
  response = openai.chat.completions.create(
    model="${f.model}",
    messages=[{"role": "user", "content": item}]
  )`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Batch API (50% off)
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`# Create batch file
batch = openai.batches.create(
  input_file_id=file_id,
  endpoint="/v1/chat/completions",
  completion_window="24h"
)
# Poll for results: openai.batches.retrieve(batch.id)
# 50% cost reduction`}
                    </pre>
                  </div>
                )}

                {isOpenAI &&
                  f.cat === OpenAICategory.REASONING_MODEL_OVERKILL && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Downgrade from Reasoning Model
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        Using {f.ml} for avg {f.ao} tok outputs — O-series
                        models are designed for complex reasoning. Consider
                        GPT-4o or GPT-4o-mini.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Using expensive reasoning model
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`response = openai.chat.completions.create(
  model="${f.model}",  # $15-60/MTok
  messages=[{"role": "user", "content": prompt}]
)`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Use GPT-4o for standard tasks
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`response = openai.chat.completions.create(
  model="gpt-4o",  # $2.50/$10 per 1M tokens
  messages=[{"role": "user", "content": prompt}]
)
# Reserve O-series for complex reasoning tasks`}
                      </pre>
                    </div>
                  )}

                {isOpenAI && f.cat === OpenAICategory.PROMPT_OPTIMIZATION && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Optimize Prompt Efficiency
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Avg {f.ai.toLocaleString()} input tokens/req producing{" "}
                      {f.ao} output tokens — prompts appear verbose or
                      inefficiently formatted.
                    </p>
                    <p className="text-xs text-bone-muted mt-2">
                      <strong>Quick wins:</strong> Remove instructional bloat,
                      use structured outputs (JSON mode), compress examples,
                      avoid redundant context.
                    </p>
                  </div>
                )}

                {isOpenAI &&
                  f.cat === OpenAICategory.HIGH_IMPACT_OPPORTUNITY && (
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ High-Impact Optimization Target
                      </h4>
                      <p className="text-xs text-bone-muted mb-3">
                        ${f.cur.toFixed(2)}/mo spend across {f.activeDays}{" "}
                        active day{f.activeDays !== 1 ? "s" : ""} — represents{" "}
                        {((f.cur / (f.cur / 0.3)) * 100).toFixed(0)}% of total
                        OpenAI spend. Even a 10-15% optimization here has
                        significant cost impact.
                      </p>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        Before: Current usage (${f.ml || f.model})
                      </p>
                      <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                        {`# Currently using ${f.model || "expensive model"}
response = openai.chat.completions.create(
    model="${f.model}",
    messages=[{"role": "user", "content": prompt}]
)
# Review if this model tier is necessary for your use case`}
                      </pre>
                      <p className="text-[11px] text-bone-subtle mb-2">
                        After: Test cheaper alternative (GPT-4o-mini at 95%
                        savings)
                      </p>
                      <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                        {`# A/B test on sample to validate quality
sample_requests = requests[:100]
quality_threshold = 0.98  # 2% accuracy tolerance

for req in sample_requests:
    original = openai.chat.completions.create(
        model="${f.model}",  # Current model
        messages=req["messages"]
    )
    test = openai.chat.completions.create(
        model="gpt-4o-mini",  # 95% cheaper
        messages=req["messages"]
    )
    # Compare outputs, measure accuracy
# If quality holds → migrate and save ~95%`}
                      </pre>
                    </div>
                  )}

                {isOpenAI && f.cat === OpenAICategory.MODEL_UPGRADE && (
                  <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                    <h4 className="text-sm font-semibold text-moss-light mb-3">
                      ✓ Upgrade to GPT-4o
                    </h4>
                    <p className="text-xs text-bone-muted mb-3">
                      Using legacy {f.ml} — GPT-4o offers better performance
                      (stronger reasoning, faster speed) at similar or lower
                      cost.
                    </p>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      Before: Legacy GPT-4 model
                    </p>
                    <pre className="text-[10px] text-critical/80 bg-ink p-2 rounded mb-2 overflow-x-auto">
                      {`response = openai.chat.completions.create(
    model="${f.model}",  # Legacy model
    messages=[{"role": "user", "content": prompt}]
)
# Outdated - slower and often more expensive`}
                    </pre>
                    <p className="text-[11px] text-bone-subtle mb-2">
                      After: Upgrade to GPT-4o (latest)
                    </p>
                    <pre className="text-[10px] text-moss-light/90 bg-ink p-2 rounded overflow-x-auto">
                      {`response = openai.chat.completions.create(
    model="gpt-4o",  # or "gpt-4o-2024-08-06" for pinned version
    messages=[{"role": "user", "content": prompt}]
)
# Better reasoning, 2x faster, lower cost
# Drop-in replacement - test on staging first`}
                    </pre>
                  </div>
                )}

                {/* Workspace/Project Organization */}
                {isAnthropic &&
                  f.cat === AnthropicCategory.WORKSPACE_ORGANIZATION && (
                    <div className="space-y-3">
                      <div className="rounded-lg bg-info/[0.05] border border-info/20 p-4">
                        <h4 className="text-sm font-semibold text-info mb-3">
                          Why this matters
                        </h4>
                        <div className="text-xs text-bone leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-strong:text-bone prose-strong:font-semibold">
                          <ReactMarkdown>{f.reason}</ReactMarkdown>
                        </div>
                      </div>
                      <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                        <h4 className="text-sm font-semibold text-moss-light mb-3">
                          ✓ Action plan
                        </h4>
                        <div className="text-xs text-bone leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-bone prose-strong:font-semibold">
                          <ReactMarkdown>{f.action}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}

                {isOpenAI && f.cat === OpenAICategory.PROJECT_ORGANIZATION && (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-info/[0.05] border border-info/20 p-4">
                      <h4 className="text-sm font-semibold text-info mb-3">
                        Why this matters
                      </h4>
                      <div className="text-xs text-bone leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-strong:text-bone prose-strong:font-semibold">
                        <ReactMarkdown>{f.reason}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="rounded-lg bg-moss/[0.05] border border-moss/20 p-4">
                      <h4 className="text-sm font-semibold text-moss-light mb-3">
                        ✓ Action plan
                      </h4>
                      <div className="text-xs text-bone leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-bone prose-strong:font-semibold">
                        <ReactMarkdown>{f.action}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Impact summary */}
                <div className="rounded-lg border border-ink-border bg-ink p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-bone-subtle mb-1">
                        Confidence
                      </p>
                      <p className="text-sm font-mono font-bold text-bone">
                        {Math.round(f.conf * 100)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-bone-subtle mb-1">
                        Expected savings
                      </p>
                      <p className="text-lg font-mono font-bold text-moss-light">
                        ${f.sav.toFixed(2)}/mo
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Row;
