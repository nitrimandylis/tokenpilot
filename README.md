# TokenPilot

**See everything. Touch nothing. Save thousands.**

TokenPilot is an LLM cost analysis and optimization tool that analyzes usage data from Anthropic and OpenAI Admin APIs to identify cost savings opportunities. Find hidden waste in 60 seconds with smart, confidence-scored recommendations backed by your actual token volumes.

## Features

### Smart Cost Analysis

- **6-Rule Detection Engine**: Identifies model downgrades, RAG context bloat, missing prompt caching, batch API opportunities, quality upgrades, and legacy model usage
- **Multi-Signal Confidence Scoring**: Weighted analysis across volume, consistency, active days, and temporal patterns—only shows optimizations proven to work
- **Conservative Savings Estimates**: Calculated from your actual token volumes, not theoretical benchmarks. High-confidence wins highlighted first.

### Dual-Vendor Support

- **Anthropic**: Analyzes organizations, workspaces, and usage across all Claude models with prompt caching detection
- **OpenAI**: Supports projects, multi-service usage (completions, audio, images, embeddings, vector stores, code interpreter), and actual cost tracking

### Privacy & Security First

- **Read-Only Access**: Only queries Admin APIs—never modifies your configuration
- **Session-Only Storage**: API keys stored in sessionStorage, cleared on browser close, never persisted
- **Client-Side Analysis**: All processing happens in your browser—no data sent to external servers
- **No Backend Persistence**: Analysis history stored locally in browser localStorage

### Rich UI & Insights

- **Month-by-Month History**: Track optimization opportunities over time with granular month navigation
- **Severity Filtering**: Focus on critical issues (>$100/mo or >20% spend) or explore all recommendations
- **Workspace/Project Breakdown**: Visual spend analysis by team, environment, or use case
- **Raw Data Viewer**: Inspect full API responses for debugging and validation

## Getting Started

### Requirements

- **Node.js** 22+ and **npm** 10+
- **Admin API Key** from Anthropic or OpenAI (read-only access)
  - Anthropic: [Create Admin API key](https://console.anthropic.com/settings/keys) (starts with `sk-ant-admin-`)
  - OpenAI: [Create Admin API key](https://platform.openai.com/api-keys) (starts with `sk-admin-`)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd tokenpilot-next

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use TokenPilot.

### Usage

1. **Select Vendor**: Choose Anthropic or OpenAI on the home page
2. **Enter API Key**: Paste your Admin API key (stored in session only, never persisted)
3. **Analyze**: Click "Get Report" to fetch and analyze your usage data
4. **Review Recommendations**: Browse findings by severity (Critical, Warning, Info)
5. **Explore Analytics**: View spend breakdown by workspace/project
6. **Track Over Time**: Navigate between months to see historical trends

## Development

### Scripts

```bash
npm run dev              # Start development server (http://localhost:3000)
npm run build            # Production build
npm start                # Start production server
npm run lint             # Next.js ESLint
npm run type-check       # TypeScript validation
npm run format           # Auto-format with Prettier
npm run format:check     # Check formatting
```

### Pre-commit Hooks

Husky + lint-staged automatically formats code on commit:

- Prettier runs on `*.{js,jsx,ts,tsx,json,css,md}`

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.8 (strict mode)
- **UI**: React 19, Tailwind CSS 4
- **State**: React Query 5 (async operations), React Context (API keys)
- **Storage**: localStorage (analyses), sessionStorage (API keys)
- **IDs**: ULID (sortable, unique identifiers)

## Architecture Overview

```
User Input (API Key in sessionStorage)
    ↓
API Proxy (/api/anthropic or /api/openai)
    ↓
Vendor Admin API (parallel requests)
    ↓
Aggregation (group by model/workspace/project)
    ↓
Analysis Engine (6 optimization rules + confidence scoring)
    ↓
Report Generation (savings, findings, KPIs)
    ↓
localStorage Persistence (month-keyed data)
    ↓
UI (Recommendations, Analytics, Raw Data views)
```

See `CLAUDE.md` for detailed architecture documentation.

## Security & Privacy

- ✅ **No telemetry or tracking**
- ✅ **API keys never leave your browser** (session-only storage)
- ✅ **Read-only Admin API access** (no mutations)
- ✅ **Client-side processing** (no external data transmission)
- ✅ **Open source** (audit the code yourself)

## License

MIT
