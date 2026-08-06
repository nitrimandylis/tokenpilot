# TokenPilot — product notes

## What it is

An LLM spend auditor. Paste a read-only Admin API key (Anthropic or OpenAI),
get back confidence-scored, dollar-quantified savings findings computed from
your real token volumes. Runs client-side, keeps nothing but local history,
and works fully offline via a seeded demo org and a mock server.

Built as part of Nick's Omilia internship; doubles as a portfolio project.

## Where it stands (2026-08-06)

- **22 detection rules** (9 Anthropic, 13 OpenAI) with weighted-signal
  confidence scoring and per-finding signal trails.
- **Consensus engine**: optional NVIDIA NIM augmentation runs alongside the
  rules, proposes findings from a fixed category set, and never prices —
  all dollar figures come from shared deterministic costing modules
  (`src/lib/*/costing.ts`). Per-finding provenance (`rules` / `llm` / `both`),
  graceful degradation to rules-only when NIM is unavailable.
- **Trust guarantees**: per-row savings capped at the row's spend, stamped
  pricing-table date, ROI footer on AI-augmented reports.
- **Persona demo**: every "sample data" click generates a fresh org — a
  sprawling enterprise (every rule fires, compounding growth arc, one
  incident month) or a lean startup (1-2 minor findings, on purpose). Each
  run is internally coherent across its 6 months; the generators are pure
  and clock-free, reproducible via explicit seeds (`DEMO_SEED` in tests).
- 96 vitest tests pin the money math; CI runs type-check, lint, format, test.
- AGPL-3.0.

## Where it's headed

Next candidates, in rough order (none committed):

1. **Live NIM verification** — the AI path has only ever run against mocked
   responses; needs a real key and a real llama round-trip. The demo now
   makes exactly one NIM call per run (current month only), so it doubles
   as the cheapest live test.
2. **Confidence calibration** — seed-sweep the rule engine, verify
   high-confidence findings are actually more robust, tune signal weights.
3. **Cross-vendor comparison** — both pricing tables are in the repo; "this
   workload on the other vendor" is a finding single-vendor tools can't make.

Shipped from this list 2026-08-06: temporal/scheduling rules (weekly-cadence
5d/4c, steady-batch 5c with a weekend-parity gate that keeps batch advice off
interactive traffic).

Explicitly cut (do not revive without a reason): token literacy score,
conversational drill-down, history/analytics investment beyond what exists.
