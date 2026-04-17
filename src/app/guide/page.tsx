import Link from "next/link";
import Header from "@/components/Header";

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Header currentPage="guide" />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Understanding Your Analysis
          </h1>
          <p className="text-slate-400">
            A comprehensive guide to interpreting your TokenPilot findings and
            taking action
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-12 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent p-6">
          <h2 className="text-xl font-bold mb-3">Quick Start</h2>
          <ol className="space-y-2 text-sm text-slate-300 list-decimal list-inside">
            <li>
              <strong>Select your provider</strong> (Anthropic or OpenAI) and{" "}
              <strong>enter your Admin API key</strong> - Anthropic Console
              (Settings → Admin Keys) or OpenAI Platform (Settings → Admin Keys)
            </li>
            <li>
              <strong>Review your findings</strong> - Each shows potential
              savings with a confidence score
            </li>
            <li>
              <strong>Expand a finding</strong> to see detailed metrics and
              actionable recommendations
            </li>
            <li>
              <strong>Implement changes</strong> starting with high-confidence,
              high-impact findings
            </li>
            <li>
              <strong>Track results</strong> by running a new analysis after
              changes
            </li>
          </ol>
        </section>

        {/* Analysis Pages */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Analysis Pages</h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Recommendations
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                Month-by-month optimization findings with severity filtering
                (Critical, Warning, Info). Each finding includes:
              </p>
              <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside">
                <li>Estimated monthly savings in USD</li>
                <li>
                  Confidence score (0-100%) based on multi-signal analysis
                </li>
                <li>
                  Detailed metrics (input/output ratios, cache rates, usage
                  patterns)
                </li>
                <li>Actionable implementation steps</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Analytics
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                Year-long spend visualization and project/workspace breakdown:
              </p>
              <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside mb-3">
                <li>
                  <strong>Anthropic:</strong> Monthly spend by workspace, top 10
                  workspaces ranked by cost
                </li>
                <li>
                  <strong>OpenAI:</strong> Monthly spend by project AND
                  service-level analysis (completions, embeddings, audio,
                  images, etc.)
                </li>
                <li>Per-project service breakdown across the entire year</li>
                <li>
                  Automatic year-based data fetching (optimized to avoid rate
                  limits)
                </li>
              </ul>
              <div className="bg-slate-950/60 rounded-lg p-3 text-xs text-slate-500">
                <strong>Performance optimization:</strong> Analytics fetches the
                entire year in 3 API calls (Anthropic) or 7 calls (OpenAI)
                instead of 36-84+ calls, grouping data by month on the client
                side.
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Raw Data
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                Complete API responses stored in localStorage for transparency
                and debugging. Includes:
              </p>
              <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside">
                <li>Organization and workspace/project metadata</li>
                <li>Usage reports grouped by model, API key, and workspace</li>
                <li>Cost data (OpenAI only)</li>
                <li>Timestamps and API endpoint information</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Key Metrics */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Key Metrics Explained</h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Input:Output Ratio
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                The ratio of input tokens to output tokens. For example, 67:1
                means you send 67 tokens to get 1 token back.
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono font-bold min-w-[60px]">
                    &lt;10:1
                  </span>
                  <span className="text-slate-400">
                    Good - Balanced usage, typical for chatbots, code generation
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-mono font-bold min-w-[60px]">
                    10-15:1
                  </span>
                  <span className="text-slate-400">
                    Moderate - May indicate large context or retrieval
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-400 font-mono font-bold min-w-[60px]">
                    &gt;15:1
                  </span>
                  <span className="text-slate-400">
                    High - Likely sending too much context, over-retrieving, or
                    getting short responses
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500">
                  <strong>Why it matters:</strong> High ratios mean you're
                  paying for tokens you don't need. Input tokens cost money
                  every time, even if they don't contribute to the response.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Average Input per Request
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                How many tokens you send on average per API call.
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono font-bold min-w-[80px]">
                    &lt;2,000
                  </span>
                  <span className="text-slate-400">
                    Small - Good for simple queries, chat responses
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono font-bold min-w-[80px]">
                    2k-8k
                  </span>
                  <span className="text-slate-400">
                    Medium - Typical for RAG, document analysis
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-mono font-bold min-w-[80px]">
                    &gt;8,000
                  </span>
                  <span className="text-slate-400">
                    Large - May be including unnecessary context
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500">
                  <strong>Common causes of large inputs:</strong> Too many
                  retrieval chunks, full document context, redundant system
                  prompts, conversation history not pruned
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Cache Rate
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                Percentage of input tokens that were served from cache (prompt
                caching).
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-red-400 font-mono font-bold min-w-[60px]">
                    &lt;5%
                  </span>
                  <span className="text-slate-400">
                    Low - You're missing major savings! Enable caching for
                    static prompts
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-mono font-bold min-w-[60px]">
                    5-30%
                  </span>
                  <span className="text-slate-400">
                    Moderate - Some caching, but room for improvement
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono font-bold min-w-[60px]">
                    &gt;30%
                  </span>
                  <span className="text-slate-400">
                    Good - You're reusing prompts effectively
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-xs text-slate-500 mb-2">
                  <strong>What to cache:</strong> System instructions, few-shot
                  examples, knowledge base context, tool definitions
                </p>
                <code className="text-xs text-emerald-400 bg-slate-950 px-2 py-1 rounded block">
                  {`{"type": "text", "text": "System instructions...", "cache_control": {"type": "ephemeral"}}`}
                </code>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Confidence Score
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                How certain we are that implementing the recommendation will
                achieve the estimated savings.
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono font-bold min-w-[60px]">
                    &gt;65%
                  </span>
                  <span className="text-slate-400">
                    High confidence - Clear pattern, well-understood fix,
                    conservative estimate
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 font-mono font-bold min-w-[60px]">
                    40-65%
                  </span>
                  <span className="text-slate-400">
                    Medium confidence - May depend on implementation details
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 font-mono font-bold min-w-[60px]">
                    &lt;40%
                  </span>
                  <span className="text-slate-400">
                    Lower confidence - Worth investigating but results may vary
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Common Optimizations */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Common Optimizations</h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">
                Optimize RAG Retrieval
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                If you have a high input:output ratio and large average inputs:
              </p>
              <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside">
                <li>
                  <strong>Reduce top-k:</strong> Instead of 10+ chunks, fetch
                  3-5 most relevant
                </li>
                <li>
                  <strong>Add reranking:</strong> Use a lightweight reranker
                  (Cohere, Jina) to filter chunks before LLM
                </li>
                <li>
                  <strong>Smaller chunks:</strong> 200-400 tokens instead of
                  800-1000
                </li>
                <li>
                  <strong>Better embeddings:</strong> Higher quality embeddings
                  = fewer chunks needed
                </li>
              </ul>
              <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                <p className="text-xs text-slate-500">
                  <strong>Expected savings:</strong> 40-60% reduction in input
                  costs
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-purple-400 mb-2">
                Downgrade Model Tier
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                When retrieval quality (not model intelligence) is the
                bottleneck:
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 mb-3">
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  Anthropic
                </p>
                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-2 text-slate-500">Model</th>
                      <th className="text-right py-2 text-slate-500">
                        Input $/M
                      </th>
                      <th className="text-right py-2 text-slate-500">
                        Output $/M
                      </th>
                      <th className="text-right py-2 text-slate-500">
                        Use Case
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr className="border-b border-slate-800/60">
                      <td className="py-2 font-mono">Opus</td>
                      <td className="text-right">$15</td>
                      <td className="text-right">$75</td>
                      <td className="text-right text-slate-500 text-[10px]">
                        Complex reasoning
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800/60">
                      <td className="py-2 font-mono">Sonnet</td>
                      <td className="text-right text-emerald-400">$3</td>
                      <td className="text-right text-emerald-400">$15</td>
                      <td className="text-right text-slate-500 text-[10px]">
                        Most use cases
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">Haiku</td>
                      <td className="text-right">$0.25</td>
                      <td className="text-right">$1.25</td>
                      <td className="text-right text-slate-500 text-[10px]">
                        Simple tasks
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 font-semibold mb-2">
                  OpenAI
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800">
                      <th className="text-left py-2 text-slate-500">Model</th>
                      <th className="text-right py-2 text-slate-500">
                        Input $/M
                      </th>
                      <th className="text-right py-2 text-slate-500">
                        Output $/M
                      </th>
                      <th className="text-right py-2 text-slate-500">
                        Use Case
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr className="border-b border-slate-800/60">
                      <td className="py-2 font-mono">GPT-4o</td>
                      <td className="text-right">$2.50</td>
                      <td className="text-right">$10</td>
                      <td className="text-right text-slate-500 text-[10px]">
                        Balanced
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 font-mono">GPT-4o-mini</td>
                      <td className="text-right text-emerald-400">$0.15</td>
                      <td className="text-right text-emerald-400">$0.60</td>
                      <td className="text-right text-slate-500 text-[10px]">
                        Fast, cheap
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">
                <strong>When to downgrade:</strong> If your task is
                retrieval-bound (RAG, search, QA), lower-tier models perform
                nearly as well at a fraction of the cost.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Enable Prompt Caching
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                If your cache rate is &lt;5% and you send similar prompts:
              </p>
              <div className="space-y-3">
                <div className="bg-slate-950/60 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-2">
                    <strong>Example:</strong> Mark system instructions for
                    caching
                  </p>
                  <pre className="text-xs text-emerald-400 overflow-x-auto">
                    {`{
  "role": "system",
  "content": [
    {
      "type": "text",
      "text": "You are a helpful assistant...",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}`}
                  </pre>
                </div>
                <p className="text-xs text-slate-500">
                  <strong>Cache pricing:</strong> 90% discount on cached tokens.
                  A prompt that costs $0.30 without caching costs $0.03 when
                  cached.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-lg font-semibold text-amber-400 mb-2">
                Use Batch API
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                For non-time-sensitive workloads (24hr SLA):
              </p>
              <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside">
                <li>Analytics and reporting</li>
                <li>Batch data processing</li>
                <li>Content moderation queues</li>
                <li>Overnight summarization jobs</li>
              </ul>
              <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                <p className="text-xs text-slate-500">
                  <strong>Savings:</strong> 50% cost reduction vs standard API
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Understanding Savings */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">
            Understanding Savings Estimates
          </h2>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <p className="text-sm text-slate-300 mb-4">
              All savings estimates are <strong>conservative</strong> and based
              on:
            </p>
            <ul className="space-y-2 text-sm text-slate-400 list-disc list-inside mb-4">
              <li>
                <strong>Actual token volumes</strong> from your usage data
              </li>
              <li>
                <strong>Current vendor pricing</strong> (Anthropic or OpenAI -
                not projected)
              </li>
              <li>
                <strong>Lower-bound assumptions</strong> - we assume moderate
                improvements
              </li>
              <li>
                <strong>Multi-signal confidence scoring</strong> - higher
                confidence = more certain savings
              </li>
            </ul>
            <div className="border-t border-emerald-500/20 pt-4 mb-4">
              <p className="text-xs text-slate-500">
                <strong>High-confidence savings (greater than 65%):</strong>{" "}
                These are the "no-brainer" optimizations with clear ROI. Start
                here.
              </p>
            </div>
            <div className="border-t border-emerald-500/20 pt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-2">
                Six-Rule Optimization Engine
              </h4>
              <div className="space-y-2 text-xs text-slate-400">
                <div>
                  <strong className="text-slate-300">
                    1. Model Downgrade:
                  </strong>{" "}
                  Detects low output:input ratios suggesting overprovisioned
                  models (e.g., Opus/GPT-4 → Sonnet/GPT-4o-mini)
                </div>
                <div>
                  <strong className="text-slate-300">
                    2. RAG Context Bloat:
                  </strong>{" "}
                  High input:output ratios (greater than 10:1) with large
                  prompts (greater than 5k tokens) indicate excessive context
                </div>
                <div>
                  <strong className="text-slate-300">
                    3. Prompt Caching Miss:
                  </strong>{" "}
                  High volume with low cache rate (less than 10%) suggests
                  missing cache configuration
                </div>
                <div>
                  <strong className="text-slate-300">
                    4. Batch API Migration:
                  </strong>{" "}
                  Bursty traffic patterns or 30%+ zero-usage days qualify for
                  50% batch API discount
                </div>
                <div>
                  <strong className="text-slate-300">5. Model Upgrade:</strong>{" "}
                  Quality opportunity (not cost savings) when higher-tier models
                  used elsewhere
                </div>
                <div>
                  <strong className="text-slate-300">6. Legacy Model:</strong>{" "}
                  (Anthropic only) Outdated model generations still in use
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Each rule uses temporal analysis (coefficient of variation,
                active days, zero-day percentage) and usage signals (volume,
                consistency, input variance) to calculate confidence scores.
              </p>
            </div>
          </div>
        </section>

        {/* Getting Help */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">
                Anthropic Resources
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a
                  href="https://docs.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-colors"
                >
                  <h4 className="text-base font-semibold text-emerald-400 mb-2">
                    Anthropic Docs
                  </h4>
                  <p className="text-xs text-slate-400">
                    Prompt caching, batch API, and best practices
                  </p>
                </a>
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-colors"
                >
                  <h4 className="text-base font-semibold text-emerald-400 mb-2">
                    Anthropic Console
                  </h4>
                  <p className="text-xs text-slate-400">
                    Monitor usage, create API keys, manage workspaces
                  </p>
                </a>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">
                OpenAI Resources
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a
                  href="https://platform.openai.com/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-colors"
                >
                  <h4 className="text-base font-semibold text-emerald-400 mb-2">
                    OpenAI Docs
                  </h4>
                  <p className="text-xs text-slate-400">
                    API reference, optimization guides, and pricing
                  </p>
                </a>
                <a
                  href="https://platform.openai.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 transition-colors"
                >
                  <h4 className="text-base font-semibold text-emerald-400 mb-2">
                    OpenAI Platform
                  </h4>
                  <p className="text-xs text-slate-400">
                    Monitor usage, create API keys, manage projects
                  </p>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-slate-800">
          <p className="text-xs text-slate-600 mb-4">
            TokenPilot · Read-only analysis · No prompts accessed
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
          >
            Run a New Analysis
          </Link>
        </div>
      </main>
    </div>
  );
}
