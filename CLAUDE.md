# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TokenPilot is an LLM cost analysis and optimization SaaS tool that analyzes usage data from Anthropic and OpenAI Admin APIs to identify cost savings opportunities. The app runs entirely client-side with Next.js, storing analyses in localStorage and API keys in sessionStorage for privacy.

## Development Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run type-check       # TypeScript validation without build
npm run lint             # Next.js ESLint

# Formatting
npm run format           # Auto-format all files with Prettier
npm run format:check     # Check formatting without changes

# Production
npm run build            # Production build
npm start                # Start production server
```

**Pre-commit hooks:** Husky + lint-staged auto-formats files on commit.

**IMPORTANT:** Always run `npm run format` after completing any code changes to ensure consistent formatting across the codebase.

## Architecture

### Data Flow

```
User enters API key (sessionStorage only)
    ↓
Home page: startAnalysis() calls vendor-specific pull()
    ↓
API Proxy (/api/anthropic or /api/openai)
    └─ Forwards requests with API key to vendor Admin APIs
    ↓
Aggregation (agg/aggOpenAI)
    └─ Consolidates usage buckets by model/key/workspace
    ↓
Analysis Engine (findIssues/findIssuesOpenAI)
    └─ Runs 6 optimization rules with confidence scoring
    ↓
Report Generation + localStorage persistence
    └─ AnalysisRecord with ULID id, stored by month
    ↓
History page → Detail routes → /recommendations, /analytics, /raw-data
```

### Storage Model

- **API Keys:** `sessionStorage` with prefix `tokenpilot_key_{vendor}` (never persisted)
- **Analyses:** `localStorage` key `tokenpilot_history` contains array of `AnalysisRecord`
  - Each record has ULID id, vendor, orgName, orgId
  - Months stored as `{YYYY-MM: MonthData}` containing report + rawData
  - Same session can accumulate multiple months under one analysis ID

### Dual-Vendor Architecture

**Anthropic:**

- Admin API: `/v1/organizations/me`, `/v1/organizations/workspaces`, `/v1/organizations/usage_report/messages`
- Usage model: input tokens + output tokens + cache_read tokens
- 3 parallel usage pulls: grouped by model, by model+api_key, by workspace+model

**OpenAI:**

- Admin API: `/v1/organization/projects`, `/v1/organization/usage/*`, `/v1/organization/costs`
- Multiple service endpoints: completions, audio_speeches, audio_transcriptions, images, moderations, vector_stores, code_interpreter_sessions
- Uses actual cost data from `/costs` API when available
- Enum-based service type checking (see `OpenAIService` enum in `lib/openai/analysis.ts`)
- Service-level analytics: tracks spending by service type (embeddings, completions, audio, images, etc.)
- Per-project service breakdown charts showing monthly usage across all services

### Analysis Engine (6 Rules)

Located in `lib/anthropic/analysis.ts` (381 lines) and `lib/openai/analysis.ts`:

1. **Model Downgrade** → Haiku/GPT-4o-mini
   - Detects low output:input ratio suggesting overprovisioned model
   - Confidence signals: output ratio, active days, cache rate

2. **RAG Context Bloat**
   - High input:output ratio (>10:1) indicates excessive prompt/context
   - Signal: avg input tokens > 5000

3. **Prompt Caching Miss**
   - High volume with low cache rate (<10%) suggests missing cache config
   - Temporal signal: consistent daily usage pattern

4. **Batch API Migration**
   - Bursty traffic (coefficient of variation >1.2) or 30%+ zero-usage days
   - 50% input cost discount for async batch processing

5. **Model Upgrade** (quality, not cost)
   - Opus/GPT-4 usage elsewhere suggests quality opportunity

6. **Legacy Model** (Anthropic only)
   - Outdated generation (g=1) still in use

**Confidence Scoring:** Multi-signal weighted system (0-1 scale)

- Signals: usage volume, consistency (CoV), active days, input variance, temporal patterns
- High confidence threshold: ≥0.65 (highlighted in UI)
- Per-API-key category tracking prevents duplicate recommendations

### Key Files

**Core Logic:**

- `lib/storage.ts` - localStorage abstraction with ULID-based IDs
- `lib/anthropic/api.ts` - Admin API client, rate limit handling, date range utilities
- `lib/anthropic/analysis.ts` - 6-rule detection engine, confidence scoring
- `lib/anthropic/pricing.ts` - Model pricing table, cost calculation (`tc()` function)
- `lib/openai/*` - Parallel implementations for OpenAI
- `lib/formatters.ts` - Currency (`$`) and percentage (`P`) formatters

**API Routes:**

- `app/api/anthropic/[...path]/route.ts` - Catch-all proxy to Anthropic Admin API
- `app/api/openai/[...path]/route.ts` - Catch-all proxy to OpenAI Admin API
- Both extract API key from `x-api-key` header and forward to vendor
- Rate limit errors (429) return special format: `RATE_LIMIT:{seconds}:{message}`

**Pages:**

- `app/page.tsx` - Home: vendor selector, API key input, analysis trigger
- `app/history/page.tsx` - Analysis history list with latest month KPIs
- `app/history/[id]/recommendations/page.tsx` - Main findings view (severity filters, confidence bars)
  - Fetches per-month data on demand (supports individual month fetching)
  - Uses `pull(apiKey, log, year, month)` for targeted month retrieval
- `app/history/[id]/analytics/page.tsx` - Year-long spend visualization
  - **Anthropic:** Workspace breakdown, top 10 by cost, monthly trends
  - **OpenAI:** Project breakdown + service-level analytics (completions, embeddings, audio, images)
  - **Optimized fetching:** Entire year in 3 calls (Anthropic) or 7 calls (OpenAI) instead of 36-84+ calls
  - Groups usage by month client-side using `bucket_start` (Anthropic) or `bucket_start_time` (OpenAI)
  - Stores each month separately for recommendations/raw-data page compatibility
- `app/history/[id]/raw-data/page.tsx` - Raw API response JSON viewer
  - Static month/year display (no navigation)
  - Shows complete API responses stored in localStorage

**Components:**

- `components/Header.tsx` - Navigation with month selector, vendor badge + org name
- `components/tokenpilot/Row.tsx` - Recommendation card (model, savings, confidence, action)
- `components/tokenpilot/ConfBar.tsx` - Horizontal confidence score visualization
- `components/tokenpilot/Stat.tsx` - KPI stat cards

### Data Fetching Strategies

**Analytics Page (Year-Based Fetching):**

For the analytics page, both vendors use optimized year-based fetching to avoid rate limits:

- **Anthropic:**
  - Single date range: Jan 1 → Dec 31 (or current date if current year)
  - 3 API calls with pagination: by model, by model+key, by workspace+model
  - Groups results by month using `bucket_start` ISO timestamp
  - Reduces calls from 36 (12 months × 3 calls) to just 3

- **OpenAI:**
  - Single date range: Jan 1 → Dec 31 (or current date if current year, using Unix timestamps)
  - 7 service endpoint calls with pagination: completions, audio_speeches, audio_transcriptions, images, moderations, vector_stores, code_interpreter_sessions
  - Groups results by month using `bucket_start_time` Unix timestamp
  - Reduces calls from 84+ (12 months × 7+ calls) to just 7

**Recommendations/Raw-Data Pages (Month-Based Fetching):**

These pages fetch individual months on demand using standard `pull()` function:

- Supports navigation between specific months
- Fetches only requested month (3 calls for Anthropic, 7+ for OpenAI)
- Used when viewing month-specific recommendations or raw API responses

**Implementation Details:**

- Analytics page uses `call()` and `fetchAllPages()` directly (bypasses `pull()`)
- All fetching includes pagination support (`has_more`, `next_page`)
- Client-side month grouping based on timestamp fields
- Each month saved separately to localStorage for cross-page compatibility

### Important Patterns

**Rate Limit Handling:**

- 429 errors parsed for `retry-after` header
- Frontend error format: `RATE_LIMIT:{seconds}:{message}` enables retry logic
- Default wait: 60 seconds if no retry-after provided

**Error Messages:**

- User-friendly messages for common HTTP errors (401, 403, 429, 500, 503)
- See `handleAnthropicError()` and `handleOpenAIError()` in respective `api.ts` files
- Include actionable guidance and relevant docs links

**Cost Calculation:**

- Function signature: `tc(model: string, inputTokens: number, outputTokens: number): number`
- Returns monthly cost in USD
- Pricing tables: `{input: $/MTok, output: $/MTok, label, tier, generation}`
- OpenAI has service-specific pricing (audio, images, embeddings, etc.)

**Temporal Analysis:**

- Coefficient of variation (CoV = σ/μ) for burstiness detection
- Zero-day percentage for batch API candidacy
- Active day counting for consistency signals

**Month Navigation:**

- URL params: `?year=YYYY&month=M` (month is 0-indexed: 0=January, 11=December)
- Header component provides prev/next/current month controls
- Navigation disabled while fetching new data

## Code Conventions

**TypeScript:**

- Strict mode enabled
- Path alias: `@/*` → `./src/*`
- Enums for service types (e.g., `OpenAIService`) instead of string literals
- Vendor type: `"anthropic" | "openai"` (not enum, stored as strings)

**State Management:**

- React Query for async operations (5min stale time, 30min cache)
- `ApiKeyContext` for sessionStorage-based key management
- Plain React `useState` for UI state (filters, modals, etc.)

**Styling:**

- Tailwind CSS utility classes
- Dark theme: slate-900/950 backgrounds, emerald-400/500 accents
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints

**Empty States:**

- All filter tabs (All, Critical, Warning, Info) have custom empty messages
- Loading states use spinner + icon backdrop for visual interest

## Security & Privacy

- **API Keys:** Never persisted beyond session, never logged, format-only validation
- **Read-Only Access:** Only GET requests to vendor APIs
- **Proxy Pattern:** Backend proxies avoid CORS and hide API keys from browser network tab
- **No Backend Persistence:** All data stored client-side in browser localStorage
- **Session Isolation:** sessionStorage cleared on browser/tab close

## Adding New Optimization Rules

When adding detection rules to the analysis engine:

1. Add rule logic to `findIssues()` in `lib/{vendor}/analysis.ts`
2. Calculate confidence score using multiple signals (volume, consistency, temporal patterns)
3. Include `savings` estimate (conservative, dollar-accurate from actual token volumes)
4. Set appropriate `severity`: "critical" (>$100/mo or >20% spend), "warning", "info"
5. Prevent duplicates by tracking categories per API key
6. Test with real usage data across multiple workspaces/projects
7. Update `Row.tsx` if new finding types need special UI treatment

## Common Gotchas

- Month parameter in URLs is **0-indexed** (January = 0, December = 11)
- Date ranges use **start of month to current date** for current month (not end of month)
- OpenAI API timestamps are Unix seconds; Anthropic dates are ISO strings
- Analytics page uses **year-based fetching** (different from recommendations page)
  - Don't use `pull()` in analytics - use `call()` with year-long date ranges
  - Must group results by month client-side after fetching
- Savings calculations are **conservative** (use high confidence thresholds, proven optimizations only)
- `storage.getMonthData()` returns null if month doesn't exist (check before accessing)
- Vendor badge must be paired with org name in header (not standalone)
- TypeScript enums for service types, but vendor is stored as plain string
- OpenAI service data must be saved as `{ ...d.raw, usage: d.usage }` for analytics charts to work
- Pagination must be handled in analytics page - check `has_more` and `next_page` fields
