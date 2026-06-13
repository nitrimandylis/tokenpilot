# TokenPilot — Roadmap / TODO

_Last updated: 2026-06-13_

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
- [ ] Export/share: reports live only in localStorage — add PDF/CSV export or
      shareable read-only snapshot.
- [ ] New analysis rules + pricing freshness: pricing tables date fast (current
      table tops out at Opus 4.6/Sonnet 4.6). Add stale-pricing guard, new
      model entries, cache-write vs cache-read economics rule, OpenAI batch
      savings rule.
- [ ] Multi-month trends in recommendations: engine sees one month at a time;
      add MoM deltas ("spend up 40% MoM") to strengthen findings.

## 3. Hygiene

- [ ] Optional: enforce conventional commits via commitlint.

---

Suggested next: shadcn/ui rework for visual polish, then export/share for
user value.
