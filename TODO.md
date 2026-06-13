# TokenPilot — Roadmap / TODO

_Last updated: 2026-06-14_

## 1. Done

- [x] Demo mode: "Try with sample data" button on home page (both vendors). Inline
      generator in `src/lib/demo.ts`; same pipeline as real analysis, no server needed.
- [x] Fix lint script: migrated from `next lint` (removed in Next 16) to `eslint src`
      with `eslint-config-next` + `@eslint/eslintrc`. Config at `eslint.config.mjs`.
- [x] Add CI: `.github/workflows/ci.yml` runs type-check, lint, format:check, tests on
      push/PR.
- [x] Unit tests for `agg`/`aggOpenAI`, 6 detection rules, and confidence scoring.
      35 tests in `src/__tests__/`. Contract tests for mock-server shapes (flat list vs
      nested buckets, field name variants). Vitest with path alias via `vitest.config.ts`.
- [x] Add `.claude/` to `.gitignore`.
- [x] Copy savings to clipboard on each recommendation row (clipboard icon in impact
      summary; shows ✓ for 2s after copy).
- [x] Total savings badge in header when viewing recommendations page (green pill next
      to org name in vendor/org row).
- [x] "Last analyzed X minutes ago" freshness indicator on history cards.
- [x] Skeleton loaders instead of bare spinner during analysis steps (home page: skeleton
      rows; recommendations page: skeleton stats + rows while fetching).
- [x] ⌘K keyboard shortcut to start new analysis from history page.
- [x] Animated empty state on history page (motion fade+scale on icon + container).

## 2. Product iterations

- [ ] shadcn/ui rework — old "industrial theme" attempt deleted; tip was
      `48e239c` (reflog-recoverable short-term only).
- [x] Export/share: CSV + JSON blob downloads via native Blob API; Print/PDF via
      `window.print()` with `@media print` CSS; dropdown in recommendations header.
- [x] New analysis rules + pricing freshness: `PRICING_TABLE_DATE` constant with >90-day stale banner; added Opus 4.8 entry; cache-write economics rule
      (Rule 5b) fires when `cacheCreated > 2M && cached/cacheCreated < 1.0`;
      OpenAI high-volume batch rule (Rule 4b) fires when `reqs > 1000 && cur > 30`.
- [x] Multi-month trends: MoM spend delta computed from previous month localStorage
      data; shown as colored ↑/↓ % in savings title band and Monthly Spend stat.

## 3. Hygiene

- [x] Enforce conventional commits via commitlint (`@commitlint/config-conventional`,
      husky `commit-msg` hook).

---

Suggested next: shadcn/ui rework for visual polish.
