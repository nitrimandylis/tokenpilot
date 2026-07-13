# TokenPilot: `next` → `tokenpilot2` Diff Report

Comparison of two checkouts of the same project:

| Slot                    | Directory          | Role            |
| ----------------------- | ------------------ | --------------- |
| **old** (`next`)        | `tokenpilot-next/` | prior version   |
| **new** (`tokenpilot2`) | `tokenpilot2/`     | current version |

> Note on naming: the task referred to the old dir as `next/`; on disk it is `tokenpilot-next/`. There is no `next/` directory.

---

## Summary

`tokenpilot2` is the same Next.js 16 / React 19 LLM-cost-analysis app, advanced along four axes:

1. **Full visual redesign** — the entire UI moves off Tailwind's stock `slate`/`emerald`/`amber`/`blue` palette onto a custom **"Ink + Moss"** design system: dark warm-black backgrounds (`ink`), bone/cream text (`bone`), moss-green accent (`moss`), and semantic `critical`/`warning`/`info` tokens. Stock Google **Inter** font is replaced by self-hosted **Clash Display** (display), **Satoshi** (sans), and **JetBrains Mono** (mono). Almost every component is touched purely for this reskin.
2. **New features** — a live model-pricing **ticker** (fetched from LiteLLM) on the home page; a **demo / "sample data"** mode; **spend forecasting** (linear regression) on analytics; **CSV / JSON / Print-PDF export** plus **expand-all** on recommendations; **month-over-month** spend deltas; a **stale-pricing guard**; a new **`/pricing`** page; copy-to-clipboard on findings; ⌘K shortcut and relative timestamps on history.
3. **New analysis rules & data** — Anthropic gains a **cache-write-efficiency** rule (5b) and tracks `cacheCreated` (cache-write) tokens; OpenAI gains a **steady high-volume batch** rule (4b); both pricing tables gain a `PRICING_TABLE_DATE`; Anthropic pricing adds the **Opus 4.8** model.
4. **Tooling / infra** — migration from legacy `.eslintrc.json` to flat **`eslint.config.mjs`**; addition of **Vitest** tests, **commitlint** + a `commit-msg` husky hook, a **GitHub Actions CI** workflow, a **mock API server** (`mock-server/`, Bun) wired through the proxy routes via `MOCK_API_URL`, motion primitives (Framer **`motion`**), and a heavily restyled README. A large amount of `console.log` debug output was stripped from the analysis/API/storage code, and several `let → const` / `any → unknown` lint cleanups were applied.

`tokenpilot-next` is **not a git repository** (no `.git`); only `tokenpilot2` has version history.

---

## Git History

### `tokenpilot2` — `git log --oneline` (29 commits)

```
b2e6746 feat: add pricing page with model comparison table and nav link
5e48cde feat: ticker shows newest models by version rank (gpt-5.5, codex, claude-opus-4-8)
8dc27da feat: sort ticker by model recency, not cost
ee3c650 feat: add SVG favicon
8384ce3 feat: spend forecasting on analytics page
0f87401 chore: remove unused vars, debug logs, and redundant config
14faa50 feat: pricing freshness guard, new analysis rules, MoM trends, commitlint
2daa348 feat: CI, tests, export/share, and UI polish
60f39c5 docs: restyle README to house visual identity (#1)
8e04994 Add MIT license
de75c62 fix: align mock server with real API shapes, add business profile simulation
6c93cef fix: handle Unix timestamps and Next.js-forwarded paths in mock server
73cd6a6 fixed mock data server
1cd7645 phases 6-9
4c9eb42 fix: remove console.log statements from recommendations page
56ca691 feat: phase 6 - recommendations page with Ink+Moss, title band, CountUp
1d47765 fix: lift monthNames to module scope, re-read storage after clear-all
15d194e feat: phase 5 - history list with Ink+Moss and numbered cards
43d97d3 fix: stagger cards directly, add a11y label and alert role
6eba56c feat: phase 4 - editorial home page with Ink+Moss theme
f711341 fix: remove always-30% calculation, add ink-hover token
98758ee feat: phase 3 - rework shared components with Ink+Moss palette
d1e176d fix: use hook for reduced-motion, fix CountUp reset, fix StaggerChildren single child
7741692 feat: phase 2 - motion primitives and marquee component
25a136a fix: map font-sans to Satoshi and font-display to Clash Display
e665890 feat: phase 1 - Ink+Moss design tokens and font foundation
6f8db20 chore: add .worktrees to .gitignore
6b992c4 fonts
6b9b99e Initial commit: TokenPilot LLM cost analysis tool
```

Branches: `main` (current), `remotes/origin/main`, `remotes/origin/readme-visual-identity`.

The history reads as: initial commit → font setup → a phased "Ink + Moss" redesign (phases 1–9) → mock server hardening → license/README/CI/tests → analysis rules + freshness guard + MoM → forecasting → favicon → ticker work → pricing page.

### `tokenpilot-next` — `git log --oneline`

```
fatal: not a git repository (or any of the parent directories): .git
```

Not under version control. No history to compare side-by-side; it represents a pre-redesign snapshot (stock slate/emerald palette, Inter font, no mock server, no tests).

---

## File Inventory

### Identical files (byte-for-byte, present in both)

```
.husky/pre-commit
.nvmrc
.prettierrc
CLAUDE.md
next-env.d.ts
next.config.js
postcss.config.js
src/app/history/[id]/page.tsx
src/components/providers.tsx
src/components/YearPicker.tsx
src/contexts/ApiKeyContext.tsx
src/lib/formatters.ts
src/types/index.ts
```

### Files that differ (present in both) — covered in detail below

```
config:   package.json, package-lock.json, tsconfig.json, .gitignore, .claude/settings.local.json
docs:     README.md
api:      src/app/api/anthropic/[...path]/route.ts, src/app/api/openai/[...path]/route.ts
pages:    src/app/error.tsx, src/app/global-error.tsx, src/app/layout.tsx, src/app/not-found.tsx,
          src/app/globals.css, src/app/page.tsx, src/app/guide/page.tsx,
          src/app/history/page.tsx, src/app/history/[id]/layout.tsx,
          src/app/history/[id]/analytics/page.tsx, src/app/history/[id]/raw-data/page.tsx,
          src/app/history/[id]/recommendations/page.tsx
components:src/components/ConfBar.tsx, Footer.tsx, Header.tsx, MonthPicker.tsx, Pill.tsx,
          RawDataViewer.tsx, Row.tsx, Stat.tsx, VendorBadge.tsx
lib:      src/lib/anthropic/analysis.ts, anthropic/api.ts, anthropic/pricing.ts,
          src/lib/openai/analysis.ts, openai/api.ts, openai/pricing.ts, src/lib/storage.ts
types:    src/types/analysis.ts, src/types/anthropic.ts
build:    tsconfig.tsbuildinfo  (generated artifact — ignored here)
```

---

## New files in `tokenpilot2` (not in `next`)

| File                                        | Lines | Purpose                                                                     |
| ------------------------------------------- | ----- | --------------------------------------------------------------------------- |
| `LICENSE`                                   | —     | MIT license (added in commit `8e04994`).                                    |
| `eslint.config.mjs`                         | 21    | Flat ESLint config (replaces `.eslintrc.json`).                             |
| `commitlint.config.ts`                      | —     | Conventional-commits rules for commitlint.                                  |
| `vitest.config.ts`                          | —     | Vitest config (`node` env, `@` → `./src` alias).                            |
| `.github/workflows/ci.yml`                  | —     | CI: type-check, lint, format-check, test on push/PR to `main`.              |
| `.husky/commit-msg` + `.husky/_/*`          | —     | `commit-msg` hook runs commitlint; full husky `_` helper dir committed.     |
| `.env.local`, `.env.local.example`          | —     | `MOCK_API_URL` wiring for the mock server.                                  |
| `mock-server/server.ts`                     | 289   | Bun mock API server (Anthropic + OpenAI shapes).                            |
| `mock-server/data.ts`                       | 703   | Randomized usage-data generator (triggers all 6 rules).                     |
| `mock-server/README.md`                     | —     | Mock-server usage docs.                                                     |
| `src/app/pricing/page.tsx`                  | 319   | New pricing page with model comparison table.                               |
| `src/app/icon.svg`                          | —     | SVG favicon (moss gradient, "TP").                                          |
| `src/lib/fonts.ts`                          | 57    | Self-hosted Clash Display / Satoshi / JetBrains Mono via `next/font/local`. |
| `src/lib/demo.ts`                           | 454   | Seeded-PRNG demo-data generator for "sample data" mode.                     |
| `src/lib/forecast.ts`                       | 73    | Linear-regression spend forecaster (slope, R², predictions).                |
| `src/hooks/useReducedMotion.ts`             | 17    | Hook respecting `prefers-reduced-motion`.                                   |
| `src/components/Marquee.tsx`                | 30    | Marquee/ticker component.                                                   |
| `src/components/motion/FadeUp.tsx`          | 28    | Fade-up reveal primitive.                                                   |
| `src/components/motion/StaggerChildren.tsx` | 62    | Staggered children reveal.                                                  |
| `src/components/motion/MagneticButton.tsx`  | 54    | Magnetic-cursor button wrapper.                                             |
| `src/components/motion/CountUp.tsx`         | 71    | Animated number count-up.                                                   |
| `src/components/motion/Parallax.tsx`        | 31    | Parallax scroll primitive.                                                  |
| `src/__tests__/anthropic-analysis.test.ts`  | 389   | Vitest suite for Anthropic analysis.                                        |
| `src/__tests__/openai-analysis.test.ts`     | 229   | Vitest suite for OpenAI analysis.                                           |

`src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7ead6a"/>
      <stop offset="100%" stop-color="#4e7a3e"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#g)"/>
  <text x="16" y="22" ... fill="#0f0d0c">TP</text>
</svg>
```

---

## Deleted files from `next` (not in `tokenpilot2`)

| File             | Reason                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.eslintrc.json` | Replaced by flat-config `eslint.config.mjs`. Old content: `{ "extends": "next/core-web-vitals" }`.                                                |
| `yarn.lock`      | Yarn lockfile dropped; project standardizes on `package-lock.json` (npm). `tokenpilot-next` shipped **both** `yarn.lock` and `package-lock.json`. |

> Also present only in `tokenpilot-next` and intentionally excluded from this walk: `.idea/` (JetBrains, now git-ignored in `tokenpilot2`).

---

## Dependency changes (`package.json`)

### `scripts`

| Script       | `next`      | `tokenpilot2`                           |
| ------------ | ----------- | --------------------------------------- |
| `dev`        | `next dev`  | `next dev --webpack`                    |
| `mock`       | —           | `bun run mock-server/server.ts` _(new)_ |
| `lint`       | `next lint` | `eslint src`                            |
| `test`       | —           | `vitest run` _(new)_                    |
| `test:watch` | —           | `vitest` _(new)_                        |

(`build`, `start`, `type-check`, `format`, `format:check`, `prepare`, and `lint-staged` are unchanged.)

### `dependencies`

| Package  | Change                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| `motion` | **added** `^12.38.0` (Framer Motion — powers the motion primitives & ticker). |

All other deps identical (`@tailwindcss/typography`, `@tanstack/react-query` `^5.94.5`, `clsx`, `next` `^16.1.6`, `react`/`react-dom` `^19.2.4`, `react-markdown`, `recharts` `^3.8.0`, `ulid`).

### `devDependencies`

| Package                           | Change                                          |
| --------------------------------- | ----------------------------------------------- |
| `@commitlint/cli`                 | **added** `^21.0.2`                             |
| `@commitlint/config-conventional` | **added** `^21.0.2`                             |
| `@eslint/eslintrc`                | **added** `^3.0.0` (FlatCompat for flat config) |
| `eslint`                          | **added** `^9.0.0`                              |
| `eslint-config-next`              | **added** `^15.3.3`                             |
| `vitest`                          | **added** `^4.1.8`                              |

(`@tailwindcss/postcss`, `@types/*`, `husky`, `lint-staged`, `prettier`, `tailwindcss`, `typescript` unchanged. Note: `next`/`eslint` were previously resolved transitively via `next lint`; now declared explicitly.)

### Lock files

- `package-lock.json`: `tokenpilot-next` = **109,063 bytes**, `tokenpilot2` = **349,352 bytes** — grew ~3.2× from the new dev tooling (eslint 9, commitlint, vitest, motion, and their trees).
- `yarn.lock`: **removed** (63,882 bytes in `tokenpilot-next`).

---

## Config changes

### `tsconfig.json`

```diff
-  "exclude": ["node_modules"]
+  "exclude": ["node_modules", "mock-server"]
```

Mock server (Bun runtime) excluded from the Next.js TS program.

### `.gitignore`

```diff
 next-env.d.ts
+
+# IDE
+.idea
+.vscode
+
+# Git worktrees
+.worktrees
+
+# Claude Code
+.claude/
```

Adds IDE dirs, `.worktrees`, and `.claude/` to ignore list (the old file ended at `next-env.d.ts` with no trailing newline).

### ESLint: `.eslintrc.json` → `eslint.config.mjs`

Old (`tokenpilot-next/.eslintrc.json`):

```json
{ "extends": "next/core-web-vitals" }
```

New (`tokenpilot2/eslint.config.mjs`): flat config via `FlatCompat`, extends `next/core-web-vitals` **and** `next/typescript`, and adds two rule overrides:

```js
rules: {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
}
```

The `^_` ignore pattern explains the new `_reset`, `_setIsRefreshing` renames seen in the source diffs.

### `.claude/settings.local.json`

Old ended its allow-list at `"Bash(tail:*)"`. New appends many entries:

```diff
-      "Bash(tail:*)"
+      "Bash(tail:*)",
+      "WebFetch(domain:orchestra.bio)",
+      "Bash(/Users/nick/.claude/plugins/cache/.../brainstorming/scripts/start-server.sh *)",
+      "Bash(curl -s http://localhost:3000)",
+      "Bash(npx next *)",
+      "Bash(git check-ignore *)",
+      "Bash(git add *)",
+      "Bash(git commit *)",
+      "Bash(git worktree *)",
+      "Bash(git -C /Users/nick/Developer/tokenpilot-next/.worktrees/ui-rework add ...)",
+      "Bash(git -C /Users/nick/Developer/tokenpilot-next/.worktrees/ui-rework commit -m ' *)",
+      "Bash(git *)",
+      "WebFetch(domain:)"
```

### New tooling configs

- **`commitlint.config.ts`** — extends `@commitlint/config-conventional`; forbids sentence/start/pascal/upper subject-case; `header-max-length` 100; `body-max-line-length` 120 (warn).
- **`vitest.config.ts`** — `environment: "node"`; `@` alias → `./src`.
- **`.husky/commit-msg`** — `npx --no -- commitlint --edit $1`.
- **`.github/workflows/ci.yml`** — node 22, npm cache, runs `npm ci` → `type-check` → `lint` → `format:check` → `test` on push/PR to `main`.

### Unchanged config

`next.config.js`, `postcss.config.js`, `.nvmrc`, `.prettierrc`, `.husky/pre-commit`, `CLAUDE.md` — identical in both.

---

## Styles & Design Tokens — `src/app/globals.css`

The single most consequential file for the reskin. `tokenpilot2` adds a `@theme` block defining the Ink + Moss palette, font vars, shadcn variable remap, and a marquee keyframe; it also rewrites body/scrollbar styles off `@apply slate-*` onto CSS vars, and adds print styles.

**New color tokens:**

```css
--color-ink: #14100f;
--color-bone: #ede4d3;
--color-ink-elevated: #1a1614;
--color-bone-muted: #c4b8a7;
--color-ink-border: #2a2220;
--color-bone-subtle: #8f827a;
--color-ink-hover: #1f1916;
--color-moss: #4e7a3e;
--color-moss-light: #7ead6a;
--color-critical: #c44536;
--color-warning: #d4a03a;
--color-info: #6b8cb8;
```

**New font vars:**

```css
--font-clash: "ClashDisplay", sans-serif;
--font-satoshi: "Satoshi", sans-serif;
--font-mono: "JetBrainsMono", monospace;
--font-sans: var(--font-satoshi);
--font-display: var(--font-clash);
```

Plus a full **shadcn variable remap** (`--background`, `--foreground`, `--card`, `--primary`, `--destructive`, `--border`, `--ring`, …) and a marquee animation:

```css
--animate-marquee: marquee 30s linear infinite;
@keyframes marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
```

**Body / scrollbar** moved off Tailwind `@apply`:

```diff
-/* Dark mode body styles */
+/* Body styles */
 body {
-  @apply bg-slate-950 text-slate-100;
+  background-color: var(--color-ink);
+  color: var(--color-bone);
 ...
-  @apply bg-slate-900;            /* track */
+  background-color: var(--color-ink-elevated);
-  @apply bg-slate-700 rounded-full;   /* thumb */
+  background-color: var(--color-ink-border);
+  border-radius: 9999px;
-  @apply bg-slate-600;            /* thumb hover */
+  background-color: var(--color-bone-subtle);
-  scrollbar-color: rgb(51 65 85) rgb(15 23 42);
+  scrollbar-color: #2a2220 #1a1614;
```

**New print block** (drives the Print/PDF export):

```css
@media print {
  header,
  footer,
  .no-print {
    display: none !important;
  }
  body {
    background: white !important;
    color: black !important;
  }
  .print-expand {
    display: block !important;
  }
  [data-row-detail] {
    display: block !important;
  }
}
```

### Palette mapping (applies to nearly every component/page below)

| old (`next`)                                  | new (`tokenpilot2`)                                |
| --------------------------------------------- | -------------------------------------------------- |
| `slate-950` / `slate-900` / `slate-800`       | `ink` / `ink-elevated` / `ink-border`              |
| `hover:bg-white/[0.02]`                       | `hover:bg-ink-hover`                               |
| `slate-200` / `slate-300` / `slate-400`       | `bone` / `bone-muted` / `bone-subtle`              |
| `slate-500` / `slate-600` / `slate-700`       | `bone-subtle` (often with `/50` for the dimmest)   |
| `emerald-400` / `emerald-500`                 | `moss-light` / `moss`                              |
| `red-400` / `red-500`                         | `critical`                                         |
| `amber-400` / `amber-500` / `yellow-400`      | `warning`                                          |
| `blue-400` / `blue-500` (+ `violet`/`purple`) | `info` (and consolidated to `moss` in the guide)   |
| `uppercase tracking-wider/widest` labels      | dropped, often `font-display tracking-tight/wider` |
| `rounded-lg` (buttons/inputs)                 | frequently `rounded-sm` / `rounded-[2px]`          |
| `font-semibold` / `font-bold` headings        | `font-display` + tighter `letterSpacing`           |
| `font-mono` numerics                          | retained, often paired with `font-display` labels  |

Unescaped apostrophes/quotes throughout JSX were also fixed to `&apos;` / `&quot;` (a `next/typescript` lint requirement) — e.g. `you're` → `you&apos;re`, `"no-brainer"` → `&quot;no-brainer&quot;`.

---

## API Routes

### `src/app/api/anthropic/[...path]/route.ts`

Adds mock-server support and removes inline comments.

```diff
+const MOCK_API_URL = process.env.MOCK_API_URL;

-    const url = new URL(`https://api.anthropic.com/${path}`);
+    const baseUrl = MOCK_API_URL || "https://api.anthropic.com";
+    const url = new URL(`${baseUrl}/${path}`);

-      headers: {
-        "x-api-key": apiKey,
-        "anthropic-version": "2023-06-01",
-      },
+    const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
+    if (!MOCK_API_URL) { headers["x-api-key"] = apiKey; }
+    // fetch(..., { headers })
```

When `MOCK_API_URL` is set, the API key header is **omitted** (mock server needs no auth). All explanatory comments (`// Extract API key from headers`, `// Await params in Next.js 16`, `// Construct the Anthropic API URL`, `// Forward query parameters`, `// Make request…`, `// Get response data`, `// Extract rate limit headers`, `// Return response…`) were removed.

### `src/app/api/openai/[...path]/route.ts`

Same pattern, plus a **v1-prefix normalization** so client endpoint strings that already include `v1/` aren't doubled:

```diff
+const MOCK_API_URL = process.env.MOCK_API_URL;

-    const url = new URL(`https://api.openai.com/${path}`);
+    const baseUrl = MOCK_API_URL || "https://api.openai.com";
+    // Client endpoint strings may already include the v1 prefix
+    const url = new URL(`${baseUrl}/v1/${path.replace(/^v1\//, "")}`);

-      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
+    const headers: Record<string, string> = { "Content-Type": "application/json" };
+    if (!MOCK_API_URL) { headers["Authorization"] = `Bearer ${apiKey}`; }
```

Same comment removals as the Anthropic route.

---

## Types

### `src/types/analysis.ts`

```diff
-  cached: number;
+  cached: number;      // cache read tokens
+  cacheCreated: number; // cache write tokens
```

Adds `cacheCreated` to the per-model row (feeds the new cache-write rule) and documents both cache fields with comments.

### `src/types/anthropic.ts`

```diff
+  cache_creation_input_tokens?: number;
```

Adds the optional Anthropic usage-bucket field for cache-creation (write) tokens (line 32).

### `src/types/index.ts`

Identical (no change).

---

## Library / Analysis Logic

### `src/lib/anthropic/pricing.ts`

```diff
+/** ISO date when pricing was last verified against Anthropic's pricing page. */
+export const PRICING_TABLE_DATE = "2026-06-14";

   // Claude 4 family (gen 4)
+  "opus-4-8": { i: 5, o: 25, l: "Opus 4.8", t: AnthropicModelTier.OPUS, g: 4 },
```

Adds the freshness-date export and the **Opus 4.8** pricing entry ($5 in / $25 out).

### `src/lib/openai/pricing.ts`

```diff
+/** ISO date when pricing was last verified against OpenAI's pricing page. */
+export const PRICING_TABLE_DATE = "2026-06-14";
```

Freshness-date export only.

### `src/lib/anthropic/analysis.ts`

1. Tracks cache-write tokens:
   ```diff
   +        cacheCreated: 0,                 // row init
   +    m[k].cacheCreated += b.cache_creation_input_tokens || 0;   // accumulation
   ```
2. Removes a debug `console.log` (the "Skipping duplicate category" log).
3. **New Rule 5b — Cache Write Efficiency** (fires when writes are large but reads sparse, i.e. cache invalidating before reuse):
   ```js
   if (r.cacheCreated > 2e6 && r.cached / r.cacheCreated < 1.0) {
     const reuseFactor = r.cacheCreated > 0 ? r.cached / r.cacheCreated : 0;
     const writeExtra = (r.cacheCreated / 1e6) * p.i * 0.25; // writes cost +25%
     const readSaving = (r.cached / 1e6) * p.i * 0.9; // reads cost -90%
     const netCacheCost = writeExtra - readSaving;
     if (netCacheCost > 1) {
       const conf = Math.min(0.9, 0.5 + (1.0 - reuseFactor) * 0.5);
       const opt = cur - netCacheCost * 0.6;
       // reason/action strings, addFinding(PROMPT_CACHING, …, Severity.WARNING, conf)
     }
   }
   ```

### `src/lib/anthropic/api.ts`

```diff
-  let allResults: UsageBucket[] = [];
+  const allResults: UsageBucket[] = [];
```

Lint cleanup (`let`→`const`).

### `src/lib/openai/analysis.ts`

1. Strips a block of debug logging and the now-unused `totalReqs`:
   ```diff
   -  const totalReqs = rows.reduce((sum, r) => sum + r.reqs, 0);
   -  console.log(`[OpenAI Analysis] Row: …`);
   -  console.log(`[OpenAI Analysis] Skipping (cost is zero)`);
   -  console.log(`[OpenAI Analysis] Skipping duplicate category …`);
   -  console.log(`[OpenAI Analysis] Found category …`);
   -  console.log(`[OpenAI Analysis] Generated ${out.length} findings`);
   ```
2. **New Rule 4b — High-Volume Batch Candidate (steady traffic)** (Rule 4 only caught bursty traffic; 4b catches steady high-volume that still gets 50% off via Batch API):
   ```js
   if (
     !isNonCompletionsService &&
     r.reqs > 1000 &&
     cur > 30 &&
     r.activeDays >= 20
   ) {
     const avgDaily = r.reqs / r.activeDays;
     const signals = [
       { weight: 0.4, met: cur > 80 },
       { weight: 0.3, met: r.reqs > 5000 },
       { weight: 0.2, met: !isGPT4OMini },
       { weight: 0.1, met: avgDaily < 2000 },
     ];
     const conf = confidenceScore(signals);
     if (conf >= 0.4) {
       const opt = cur * 0.5;
       const sev = conf >= 0.65 ? Severity.WARNING : Severity.INFO;
       addFinding(BATCH_API_MIGRATION, opt, reason, action, sev, conf);
     }
   }
   ```

### `src/lib/openai/api.ts`

Lint cleanups + log removals:

```diff
-  let org: any = { id: "", name: "Organization" };
+  const org: any = { id: "", name: "Organization" };
-  let allUsageData: any[] = [];
+  const allUsageData: any[] = [];
-      let allPages: any[] = [];
+      const allPages: any[] = [];
-  console.log(`[OpenAI API] Fetched ${pageCount} pages …`);
-  console.log(`[OpenAI API] Fetched ${allUsageData.length} total usage records …`);
```

### `src/lib/storage.ts`

Removes three debug logs only (`[Storage] No analysis found…`, `Deleting month data…`, `Month data cleared successfully`). No behavioral change.

### `src/lib/openai/analysis.ts` / `anthropic/analysis.ts` — net effect

New rules raise the count of possible findings from 6 → effectively 7-per-vendor variants; existing rule numbering preserved (5b / 4b are sub-rules).

---

## Components

> Every component below also receives the palette/font remap from the table above. Only **structural / behavioral** changes are called out per file; pure color swaps are summarized.

### `src/components/ConfBar.tsx`

- Drops the dynamic 3-tier color logic (`pct >= 70 ? emerald : pct >= 50 ? amber : slate`) for a single **`bg-moss`** fill.
- Bar height `h-1.5` → `h-[3px]`; label `text-[10px]` → `text-xs`; colors → `ink-border` / `bone-subtle`.

### `src/components/Footer.tsx`

- Palette swap; copyright text shortened: `© {year} TokenPilot. All rights reserved.` → `© {year} TokenPilot`.

### `src/components/Header.tsx`

- `currentPage` union gains `"pricing"`.
- Logo: the gradient "TP" square is **removed**; brand becomes a single `font-display` wordmark with `letterSpacing: -0.03em`.
- **New "Pricing" nav link** added.
- Active-tab style changes from `text-emerald-400` to `text-bone border-b-2 border-moss pb-0.5`; nav text `text-xs font-semibold` → `text-sm font-sans`.
- CTA: `Get New Report` → `Get new report →`, restyled (`bg-emerald-500 text-slate-950` → `bg-moss text-bone`, `rounded-lg`→`rounded-sm`).

### `src/components/MonthPicker.tsx`

- Removes a dead `years` array computation:
  ```diff
  -  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i).reverse();
  ```
  (unused-var cleanup; no other behavior change).

### `src/components/Pill.tsx`

- Severity classes change from translucent ring style (`bg-red-500/10 text-red-400 ring-red-500/20`, etc.) to solid semantic fills:
  ```diff
  -    critical: "bg-red-500/10 text-red-400 ring-red-500/20",
  -    warning:  "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  -    info:     "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  -    ok:       "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  +    critical: "bg-critical text-bone",
  +    warning:  "bg-warning text-ink",
  +    info:     "bg-info text-bone",
  +    ok:       "bg-moss text-bone",
  ```
- Label casing `"OK"` → `"Ok"`; container loses the ring, `rounded-full`→`rounded-[2px]`, `font-semibold`→`font-medium`.

### `src/components/RawDataViewer.tsx`

- Palette swap only (slate/red → ink/critical, bone tokens). No structural change.

### `src/components/Row.tsx` — significant

- New `import { useState }`; `RowProps` gains a required **`index: number`**.
- New **copy-to-clipboard** state + handler:
  ```js
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(
      `${f.name}: save ${$(f.sav)}/mo — ${f.reason}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  ```
- Card header restructured: adds a **two-digit index** (`{String(index).padStart(2,"0")}`), moves the `Pill` to a leading position, retitles with `font-display text-[19px]`, and reorders the confidence/current/savings columns (the standalone "Current" column is dropped; savings becomes a large `font-mono text-xl` value with a `/mo` suffix only when `f.sav > 0`).
- Detail panel: a **copy button** (with check/copy SVG icon, toggling on `copied`) added next to "Expected savings".
- Border/severity styling moves to `border-critical/30` · `border-warning/20` · `border-ink-border`; many `text-slate-*` → `bone`/`moss-light`/`critical`/`warning`.

### `src/components/Stat.tsx`

- Label loses `uppercase tracking-wide`, becomes `font-sans text-bone-subtle`.
- Value gains `font-mono`; color map `emerald-400/yellow-400/white` → `moss-light/warning/bone`.

### `src/components/VendorBadge.tsx`

- Palette swap only: badge background `bg-slate-500/10 border-slate-500/20` → `bg-ink-elevated border-ink-border`; icon colors → `bone` / `bone-subtle`.

### Unchanged components

`providers.tsx`, `YearPicker.tsx` — identical.

---

## Pages

### `src/app/layout.tsx`

Swaps Google **Inter** for the three self-hosted fonts:

```diff
-import { Inter } from "next/font/google";
-const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
+import { clashDisplay, satoshi, jetbrainsMono } from "@/lib/fonts";

-<body className={`${inter.variable} font-sans antialiased`}>
+<body className={`${clashDisplay.variable} ${satoshi.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
```

### `src/app/error.tsx`

- `reset` → `_reset` (unused-arg lint rule).
- Two apostrophe escapes (`we'll` → `we&apos;ll`, `you're` → `you&apos;re`).

### `src/app/global-error.tsx`

- `import Link from "next/link"`; the home `<a>` becomes `<Link>`.

### `src/app/not-found.tsx`

- Full palette swap (ink/bone/moss); large "404" gradient and the TP badge recolored; headings gain `font-display`; apostrophes escaped. No structural change.

### `src/app/history/[id]/layout.tsx`

- Drops unused `Vendor` import (`import { storage, Vendor }` → `import { storage }`).
- `bg-slate-950` → `bg-ink` (incl. the Suspense fallback).

### `src/app/history/[id]/raw-data/page.tsx`

- Removes `useApiKey` import/usage (`const { getKey } = useApiKey();` deleted — now unused).
- `setIsRefreshing` → `_setIsRefreshing` (setter unused after refactor).
- Palette swap; "Raw API Data" heading drops `uppercase tracking-wide`.

### `src/app/guide/page.tsx`

- Wraps `<Header>` in `<Suspense>` with a new `HeaderSkeleton` (`h-16 bg-ink-elevated animate-pulse`).
- All section headings gain `font-display`.
- **Color consolidation:** the guide's previously multi-colored optimization cards (`text-blue-400`, `text-purple-400`, `text-amber-400`) collapse onto **`text-moss`** / `text-warning`; metric examples recolor emerald/amber/red → moss/warning/critical; the pricing comparison tables recolor.
- Numerous apostrophe/quote escapes and `{" "}` whitespace-JSX insertions.
- Otherwise content-identical (same copy, same tables).

### `src/app/history/page.tsx` — significant

- `import { motion } from "motion/react"`.
- **`monthNames` lifted to module scope** (was a component-local const); new module-level **`relativeTime(iso)`** helper (`just now` / `Xm` / `Xh` / `Xd ago`).
- **⌘K / Ctrl-K shortcut** added via `useEffect` keydown listener → `router.push("/")`.
- **Clear-all bugfix:** after clearing, re-reads storage instead of blanking state:
  ```diff
  -      setAnalyses([]);
  +      setAnalyses(storage.getAllAnalyses());
  ```
- Empty-state and cards wrapped in **`motion.div`** reveal animations; empty state adds a "Tip: Press ⌘K…" line and a "Get started →" CTA.
- Cards get a **two-digit index**, `VendorBadge size="small"`, a **relative "analyzed …" timestamp**, spend rendered as `$X/mo` with a `font-mono font-bold` savings figure; copy tweaks (`Analysis History`→`Analysis history`, `Clear All`→`Clear all`, etc.).

### `src/app/history/[id]/analytics/page.tsx` — significant

- New imports: `tcOpenAI` from pricing, **`forecast`** from `@/lib/forecast`.
- Strips a large volume of `[Analytics]` debug `console.log`s; `let`→`const` cleanups; `setIsRefreshing`→`_setIsRefreshing`.
- **`tcOpenAI` signature change** — the inline `require("@/lib/openai/pricing")` is removed (now a top import) and the call changes from passing a price object to explicit args, with a cost fallback:
  ```diff
  -  const pCost = tcOpenAI(p);
  +  const pCost = p.cost > 0 ? p.cost : tcOpenAI(p.model, p.inp, p.out);
  -  projectSpend[p.project_id] = pCost;
  +  projectSpend[p.project_id || "default"] = pCost;
  ```
- **New "Spend Forecast" UI block** (`forecast(analysisRecord, 3)`): a confidence badge (HIGH/MEDIUM/LOW from R²), three predicted-month cards, and an up/down `$/mo` trend line.
- **Chart recolor:** the 8-color categorical palette moves from named Tailwind colors to Ink+Moss hexes, e.g.:
  ```diff
  -  "bg-blue-500","bg-violet-500","bg-amber-500","bg-emerald-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-orange-500"
  +  "bg-[#5a8bc4]","bg-[#9b7bc4]","bg-[#c4a35a]","bg-moss","bg-[#c47b8b]","bg-[#5ab4c4]","bg-[#7b8bc4]","bg-[#c4875a]"
  ```
  Recharts `CartesianGrid`/`XAxis`/`YAxis`/`Tooltip` stroke & fill values recolored (`#1e293b`/`#334155`/`#64748b`/`#e2e8f0`/`#cbd5e1`/`#475569` → `#2a2220`/`#c4b8a7`/`#1a1614`/`#ede4d3`), and the inline `0..7` color map likewise.
- Section headings move to `font-display tracking-tight/wider` (drop `uppercase tracking-widest`).

### `src/app/history/[id]/recommendations/page.tsx` — significant

- New imports: **`CountUp`**, `MonthData` type, and both **`PRICING_TABLE_DATE`** exports (aliased `ANTHROPIC_PRICING_DATE` / `OPENAI_PRICING_DATE`).
- `monthNames` lifted to module scope (was duplicated **twice** locally; both removed).
- New state: **`expandAll`**, **`showExport`**.
- **Month-over-month**: computes `prevMonthData` via `storage.getMonthData`, and `momSpendDelta`.
- **Stale-pricing guard**: `pricingAgeDays`/`pricingStale` (> 90 days) → renders a warning banner pointing at the vendor pricing page.
- **Export menu**: new `exportCSV(report)` (9-column CSV, quote-escaped, downloaded as `tokenpilot-<org>-<YYYY>-<MM>.csv`) and `exportJSON(report)` (structured payload with `generatedAt`), plus a **Print / PDF** action that expands all rows then calls `window.print()`. Surfaced via an "Export" dropdown with CSV / JSON / Print options.
- Error handling: `catch (error: any)` → `catch (error: unknown)` with `instanceof Error` narrowing.
- Loading state completely rebuilt: the old centered bar-chart SVG + spinner is replaced by **skeleton stat bar + skeleton rows** with staggered opacity and an inline "Analyzing {month} {year}…" spinner.
- New **"Savings title band"**: a `CountUp`-animated "You could save $X/mo" header with `font-display`, % of spend, and the MoM delta (colored critical/moss by direction).
- Header gains a **"Save $X/mo" pill**, an **Expand all / Collapse all** toggle, and a `no-print` wrapper; the KPI strip shows the MoM delta in place of keys/workspaces when available.
- `<Row>` now receives **`index={key+1}`**, and `open`/`toggle` honor `expandAll`.
- Copy tweaks: `Optimization Recommendations` → `Recommendations`, `Raw API Data` → `Raw data`, `Monthly Analysis` → `Monthly analysis`; filter chips restyled to `rounded-sm` with `border` on active.

### `src/app/page.tsx` (home) — most-changed page (~693 diff lines)

New imports: `useCallback`; `demoAnthropic`, `demoOpenAI` from `@/lib/demo`; motion primitives **`FadeUp`**, **`StaggerChildren`**, **`MagneticButton`**, and **`Marquee`**.

1. **Live pricing ticker.** New module-level constants and helpers:
   - `LITELLM_URL` (raw GitHub `model_prices_and_context_window.json`), `DEFAULT_TICKER` (fallback list).
   - `formatModelId(id, provider)` — humanizes model IDs (strips date suffixes; `gpt-5.5-pro`→`GPT-5.5 Pro`; Anthropic digit-merging).
   - `fmtTickerPrice(n)`, `modelDate(id)` (parses `-YYYYMMDD` / `-YYYY-MM-DD`), `modelRank(id)` (version ranking so newest families surface first), `isLegacy(id)` (filters gpt-3/old gpt-4/davinci/fine-tunes/old claude-3).
   - `tickerItems` state + `buildTicker` (`useCallback`) that fetches LiteLLM, picks top-4 newest Anthropic + top-4 newest OpenAI by date→rank, appends Batch/caching lines; a `useEffect` triggers the fetch.
2. **Demo mode.** New `startDemo()` async fn — generates 6 months of seeded sample data for the selected vendor (`demoOpenAI`/`demoAnthropic`), aggregates, runs findings, builds `Report` objects, `storage.saveAnalysis`, then routes to recommendations. Surfaced as an **"or … Try with sample data →"** button under the input.
3. **Hero redesign.** The old "Find the waste in your <vendor> API spend" headline + inline form becomes an `FadeUp` hero — **"Spend less. / Ship more."** (`font-display text-5xl/7xl`, the second line on a `bg-moss` highlight) with a new subhead, the **Marquee ticker**, then the vendor selector + key input wrapped in `FadeUp`.
4. **Accessibility.** Adds an `<label htmlFor="api-key-input" className="sr-only">` and `id` on the input; the error box gets `role="alert" aria-live="assertive"`.
5. **Analyze button** wrapped in `MagneticButton`; label `Analyze` → `Analyze →`; vendor pills and input restyled (`rounded-sm`, ink/moss).
6. **Loading state** redesigned with an inline spinner row and **skeleton recommendation rows**.
7. Feature-card copy de-title-cased (`Find Hidden Waste in 60 Seconds` → `Find hidden waste in 60 seconds`, etc.) and slightly trimmed; cards wrapped in `StaggerChildren`.
8. `catch (x: any)` → `catch (x: unknown)`.

### Unchanged page

`src/app/history/[id]/page.tsx` — identical.

---

## Documentation — `README.md`

Completely rewritten (commit `60f39c5` "restyle README to house visual identity"). Both describe the same product; the new one is a marketing-styled doc.

Key differences:

- **ASCII-art "TOKENPILOT" banner** + centered layout (`<div align="center">`), shields.io badges (telemetry 0, keys never leave browser, read-only, 6 rules, "savings real").
- Tagline reformatted to `SEE EVERYTHING. TOUCH NOTHING. SAVE THOUSANDS.`; adds emoji section headers (`💸 What is this`, `🔍 The detection engine`, `🧾 Dual-vendor support`, `🚀 Run it`, `🔩 Under the hood`, `🔒 Security & privacy`).
- The 6 rules and dual-vendor support are reformatted from bullet lists into **markdown tables**.
- Architecture diagram changes from an ASCII flow to a **Mermaid `flowchart`**, plus a tech-stack table.
- Clone instructions: generic `<repository-url>` / `cd tokenpilot-next` → concrete `https://github.com/nitrimandylis/tokenpilot.git` / `cd tokenpilot`.
- Adds a mention of the new **`mock-server/`** for offline dev.
- Footer credits **Nick Trimandylis**, slogan `THE CHEAPEST TOKEN IS THE ONE YOU DIDN'T SEND`, "MIT licensed."
- Size: 4,704 → 7,028 bytes.

---

## Build Artifact (noted, not analyzed)

`tsconfig.tsbuildinfo` differs (139,421 → 180,442 bytes). This is a generated TypeScript incremental-build cache; the difference simply reflects the added source files and is not a meaningful source change.

---

## Minute Details Index

- **`let` → `const`**: `anthropic/api.ts` (`allResults`), `openai/api.ts` (`org`, `allUsageData`, `allPages`), `analytics/page.tsx` (`allUsageData`, `org`).
- **`any` → `unknown`** (with `instanceof Error` narrowing): `page.tsx` (`catch x`), `recommendations/page.tsx` (`catch error`).
- **Underscore-prefixed unused bindings** (per new eslint rule): `error.tsx` `reset`→`_reset`; `raw-data/page.tsx` & `analytics/page.tsx` `setIsRefreshing`→`_setIsRefreshing`.
- **Dead code removed**: `MonthPicker.tsx` `years` array; `history/page.tsx` clear-all blanking; `raw-data/page.tsx` `useApiKey`; `recommendations/page.tsx` duplicate `monthNames` (×2) and `mxW` line; `openai/analysis.ts` `totalReqs`.
- **`console.log` removals**: `anthropic/analysis.ts` (1), `openai/analysis.ts` (~6), `openai/api.ts` (3), `storage.ts` (3), `analytics/page.tsx` (~15), `recommendations/page.tsx` (~6).
- **Comment removals**: both API route files lose all 8 inline comments each.
- **Module-scope hoists**: `monthNames` in `history/page.tsx` and `recommendations/page.tsx`; new `relativeTime` helper.
- **Import reorders/additions**: `motion/react`, motion primitives, `CountUp`, `demo`, `fonts`, `forecast`, `tcOpenAI`, `PRICING_TABLE_DATE`, `MonthData`, `next/link` (global-error), `Suspense`/`useCallback`.
- **Copy / casing**: extensive de-title-casing of headings and buttons (e.g. `Get New Report`→`Get new report →`, `Raw API Data`→`Raw data`, `Optimization Recommendations`→`Recommendations`, `Clear All`→`Clear all`, `OK`→`Ok`, `Why This Matters`→`Why this matters`, `✓ Action Plan`→`✓ Action plan`). Several CTAs gain a trailing `→`.
- **JSX entity escapes**: `'` → `&apos;` and `"` → `&quot;` across guide/not-found/error/Row/history (required by `next/typescript`).
- **Whitespace-JSX** `{" "}` insertions in `guide/page.tsx` after bolded list labels.

```

```
