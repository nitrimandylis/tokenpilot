import type { PullResult, UsageBucket, Organization, Workspace } from "@/types";
import type {
  OpenAIPullResult,
  OpenAIUsageData,
  OpenAICostsData,
} from "@/lib/openai/api";
import { tcOpenAI } from "@/lib/openai/pricing";

// Default seed so tests (and any caller that wants reproducible output) get
// byte-identical data. The UI draws a fresh random seed per click, so every
// demo run generates a new org — but one seed is threaded through all six
// monthly calls of a run: re-seeding per month would produce a different
// fake org each month.
export const DEMO_SEED = 20260717;

// Which kind of org a demo run simulates. "enterprise" is a sprawling mess
// where every rule category fires; "startup" is a small, mostly-optimized
// org that proves the tool doesn't invent waste where there isn't any.
export type DemoPersona = "enterprise" | "startup";

// ─── PRNG ────────────────────────────────────────────────────────────────────

function makeRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ─── Business profile ────────────────────────────────────────────────────────

interface BusinessProfile {
  orgName: string;
  scale: number; // org size multiplier applied to every workload
  weekendFactor: number; // weekend traffic as a share of weekday traffic
  jitter: number; // daily noise band around 1 (kept small so trends read)
  growthRate: number; // month-over-month volume growth toward the present
}

const ORG_PREFIXES = [
  "Acme",
  "Northwind",
  "Vertex",
  "BlueHarbor",
  "Quantra",
  "Helio",
  "Mosswood",
  "Ironclad",
  "Skyline",
  "Cobalt",
  "Latchford",
  "Ferrous",
];

const ORG_SUFFIXES = [
  "Corp",
  "Labs",
  "Systems",
  "Dynamics",
  "Software",
  "Analytics",
  "Robotics",
  "Industries",
];

function newProfile(seed: number, persona: DemoPersona): BusinessProfile {
  const r = makeRand(seed ^ hashStr("profile"));
  const orgName = `${ORG_PREFIXES[Math.floor(r() * ORG_PREFIXES.length)]} ${
    ORG_SUFFIXES[Math.floor(r() * ORG_SUFFIXES.length)]
  }`;
  const weekendFactor = 0.55 + r() * 0.25;
  if (persona === "startup") {
    return {
      orgName,
      scale: 0.9 + r() * 0.4,
      weekendFactor,
      jitter: 0.16,
      growthRate: 0.03 + r() * 0.03,
    };
  }
  return {
    orgName,
    scale: 0.7 + r() * 1.8,
    weekendFactor,
    jitter: 0.16,
    growthRate: 0.1 + r() * 0.04,
  };
}

// ─── 6-month arc ─────────────────────────────────────────────────────────────
//
// Each run's months form a deliberate shape instead of independent noise:
// volumes compound by the profile's seeded growth rate toward the present
// (monthsAgo 0 = current month, 5 = oldest), normalized for month length so
// the trend survives short months and the analytics forecast has a real
// slope to fit. Legacy workloads decay ~20%/mo instead (a migration in
// progress), and the enterprise Agent Platform workspace has one incident
// month at monthsAgo 2: a runaway agent loop that multiplies cache writes
// and input volume before being fixed.

const DEMO_WINDOW = 5; // oldest monthsAgo in a 6-month run
const INCIDENT_MONTHS_AGO = 2;
const INCIDENT = { inp: 10, out: 4, reqs: 8, cacheWrite: 4.2 };

function arcMult(profile: BusinessProfile, monthsAgo: number): number {
  return Math.pow(1 + profile.growthRate, -monthsAgo);
}

function decayMult(monthsAgo: number): number {
  return Math.pow(0.8, DEMO_WINDOW - monthsAgo);
}

// ─── Anthropic ───────────────────────────────────────────────────────────────
//
// Enterprise: 8 workspaces plus an overloaded default. Each workspace runs a
// distinct, realistic workload pattern so most rule categories fire in a demo
// run: caching miss, Haiku downgrade, RAG bloat, batch candidate,
// Opus→Sonnet, legacy model, cache-write waste, plus a quiet staging
// workspace. Traffic with no workspace_id lands in the (biggest-spending)
// default workspace, which also triggers the org-structure finding.
//
// Startup: 3 workspaces of mostly well-optimized traffic. Only production's
// never-enabled prompt caching should fire — a small, honest finding.

const ANTH_WORKSPACES: Workspace[] = [
  { id: "ws_prod", name: "Production API", display_name: "Production API" },
  {
    id: "ws_support",
    name: "Support Chatbot",
    display_name: "Support Chatbot",
  },
  {
    id: "ws_rag",
    name: "Knowledge Base RAG",
    display_name: "Knowledge Base RAG",
  },
  { id: "ws_evals", name: "Nightly Evals", display_name: "Nightly Evals" },
  {
    id: "ws_research",
    name: "Research Sandbox",
    display_name: "Research Sandbox",
  },
  {
    id: "ws_legacy",
    name: "Legacy Summarizer",
    display_name: "Legacy Summarizer",
  },
  { id: "ws_agents", name: "Agent Platform", display_name: "Agent Platform" },
  { id: "ws_staging", name: "Staging", display_name: "Staging" },
].map((w, i) => ({
  ...w,
  created_at: `2024-0${(i % 8) + 1}-01T00:00:00Z`,
}));

const STARTUP_ANTH_WORKSPACES: Workspace[] = [
  { id: "ws_prod", name: "Production", display_name: "Production" },
  {
    id: "ws_internal",
    name: "Internal Tools",
    display_name: "Internal Tools",
  },
  { id: "ws_staging", name: "Staging", display_name: "Staging" },
].map((w, i) => ({
  ...w,
  created_at: `2025-0${i + 1}-01T00:00:00Z`,
}));

// One entry per (workspace, api key, model) workload. Daily base volumes are
// sized so every pattern clears its rule thresholds even at the low end of
// the profile's scale range. wid undefined → default workspace.
interface AnthWorkload {
  wid?: string;
  key: string;
  model: string;
  inp: number; // daily base input tokens
  out: number; // daily base output tokens
  reqs: number; // daily base requests
  cacheRate: number; // share of input served from cache
  cacheWrite?: number; // daily base cache-creation tokens
  cacheReads?: number; // daily base cache-read tokens (overrides cacheRate)
  mondayBoost?: boolean; // bursty Monday spikes → batch candidate
  decay?: boolean; // shrinks ~20%/mo instead of growing (migration story)
  incidentSpike?: boolean; // hit by the enterprise incident month
}

const ANTH_WORKLOADS: AnthWorkload[] = [
  // Overloaded default workspace: the org's main app never got segmented.
  {
    key: "key_default_app",
    model: "claude-opus-4-6-20250514",
    inp: 2_400_000,
    out: 250_000,
    reqs: 700,
    cacheRate: 0.15,
  },
  {
    key: "key_default_app",
    model: "claude-sonnet-4-6-20250514",
    inp: 800_000,
    out: 200_000,
    reqs: 600,
    cacheRate: 0.25,
  },
  {
    key: "key_default_misc",
    model: "claude-haiku-4-5-20250514",
    inp: 400_000,
    out: 100_000,
    reqs: 300,
    cacheRate: 0.1,
  },
  // Production: heavy volume, caching never enabled → prompt caching miss.
  {
    wid: "ws_prod",
    key: "key_prod",
    model: "claude-sonnet-4-6-20250514",
    inp: 3_500_000,
    out: 450_000,
    reqs: 700,
    cacheRate: 0.004,
  },
  // Support chatbot: Opus emitting tiny outputs → Haiku downgrade.
  {
    wid: "ws_support",
    key: "key_support",
    model: "claude-opus-4-6-20250514",
    inp: 300_000,
    out: 15_000,
    reqs: 250,
    cacheRate: 0.03,
  },
  // RAG service: enormous retrieval context per request → RAG bloat.
  {
    wid: "ws_rag",
    key: "key_rag",
    model: "claude-sonnet-4-6-20250514",
    inp: 1_600_000,
    out: 25_000,
    reqs: 60,
    cacheRate: 0.2,
  },
  // Nightly evals: Monday spikes, quiet otherwise → batch API candidate.
  {
    wid: "ws_evals",
    key: "key_evals",
    model: "claude-sonnet-4-6-20250514",
    inp: 500_000,
    out: 120_000,
    reqs: 300,
    cacheRate: 0.1,
    mondayBoost: true,
  },
  // Research: Opus on moderate-complexity work → Opus→Sonnet downgrade.
  {
    wid: "ws_research",
    key: "key_research",
    model: "claude-opus-4-6-20250514",
    inp: 700_000,
    out: 70_000,
    reqs: 100,
    cacheRate: 0.1,
  },
  // Legacy summarizer: still on Claude 3 Opus, being migrated away —
  // decays across the window but the legacy finding still fires today.
  {
    wid: "ws_legacy",
    key: "key_legacy",
    model: "claude-3-opus-20240229",
    inp: 150_000,
    out: 15_000,
    reqs: 80,
    cacheRate: 0,
    decay: true,
  },
  // Agent platform: writes big cache prefixes it rarely reads back. Also the
  // site of the incident month's runaway loop.
  {
    wid: "ws_agents",
    key: "key_agents",
    model: "claude-sonnet-4-6-20250514",
    inp: 300_000,
    out: 40_000,
    reqs: 120,
    cacheRate: 0,
    cacheWrite: 400_000,
    cacheReads: 20_000,
    incidentSpike: true,
  },
  // Staging: light, well-behaved traffic — no findings expected.
  {
    wid: "ws_staging",
    key: "key_staging",
    model: "claude-haiku-4-5-20250514",
    inp: 200_000,
    out: 50_000,
    reqs: 100,
    cacheRate: 0.15,
  },
];

const STARTUP_ANTH_WORKLOADS: AnthWorkload[] = [
  // Production: healthy model choice and shape, but prompt caching was never
  // enabled — the run's one deliberate (small) finding.
  {
    wid: "ws_prod",
    key: "key_prod",
    model: "claude-sonnet-4-6-20250514",
    inp: 1_000_000,
    out: 120_000,
    reqs: 400,
    cacheRate: 0.02,
  },
  // Internal tools: Haiku, well cached — nothing to flag.
  {
    wid: "ws_internal",
    key: "key_internal",
    model: "claude-haiku-4-5-20250514",
    inp: 1_200_000,
    out: 250_000,
    reqs: 500,
    cacheRate: 0.3,
  },
  // Staging: light, clean traffic.
  {
    wid: "ws_staging",
    key: "key_staging",
    model: "claude-sonnet-4-6-20250514",
    inp: 60_000,
    out: 15_000,
    reqs: 60,
    cacheRate: 0.35,
  },
];

interface AnthEntry {
  bucket_start: string;
  model: string;
  api_key_id: string;
  workspace_id?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  request_count: number;
}

function genAnthropicEntries(
  profile: BusinessProfile,
  seed: number,
  year: number,
  month: number,
  persona: DemoPersona,
  monthsAgo: number
): AnthEntry[] {
  const rand = makeRand(seed ^ (year * 12 + month) ^ hashStr("anth"));
  const { scale, jitter } = profile;
  const workloads =
    persona === "startup" ? STARTUP_ANTH_WORKLOADS : ANTH_WORKLOADS;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Normalize monthly volume for month length so the arc isn't distorted by
  // 28-day months.
  const monthNorm = 30 / daysInMonth;
  const growth = arcMult(profile, monthsAgo);
  const entries: AnthEntry[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const isMonday = dow === 1;
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;

    for (const w of workloads) {
      const wm = isWeekend ? profile.weekendFactor : 1;
      const v = 1 - jitter / 2 + rand() * jitter;
      const trend = w.decay ? decayMult(monthsAgo) : growth;
      let mult = wm * v * scale * trend * monthNorm;
      if (w.mondayBoost) mult *= isMonday ? 8 : 0.3;

      const incident =
        persona === "enterprise" &&
        monthsAgo === INCIDENT_MONTHS_AGO &&
        !!w.incidentSpike;

      const inp = Math.floor(w.inp * mult * (incident ? INCIDENT.inp : 1));
      const out = Math.floor(w.out * mult * (incident ? INCIDENT.out : 1));
      const reqs = Math.floor(w.reqs * mult * (incident ? INCIDENT.reqs : 1));
      const cache =
        w.cacheReads !== undefined
          ? Math.floor(w.cacheReads * mult)
          : Math.floor(inp * w.cacheRate * (0.8 + rand() * 0.4));
      const cacheCreated = w.cacheWrite
        ? Math.floor(w.cacheWrite * mult * (incident ? INCIDENT.cacheWrite : 1))
        : 0;

      if (inp === 0 && out === 0) continue;

      entries.push({
        bucket_start: ds,
        model: w.model,
        api_key_id: w.key,
        workspace_id: w.wid,
        input_tokens: inp,
        output_tokens: out,
        cache_read_input_tokens: Math.min(cache, Math.floor(inp * 0.9)),
        cache_creation_input_tokens: cacheCreated,
        request_count: Math.max(1, reqs),
      });
    }
  }

  return entries;
}

export function demoAnthropic(
  year: number,
  month: number,
  seed: number = DEMO_SEED,
  persona: DemoPersona = "enterprise",
  monthsAgo: number = 0
): PullResult {
  const profile = newProfile(seed, persona);

  const org: Organization = {
    id: `demo_org_${(seed >>> 0).toString(36)}`,
    name: profile.orgName,
  };
  const ws = persona === "startup" ? STARTUP_ANTH_WORKSPACES : ANTH_WORKSPACES;
  const entries = genAnthropicEntries(
    profile,
    seed,
    year,
    month,
    persona,
    monthsAgo
  );

  const bm: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    cache_creation_input_tokens: e.cache_creation_input_tokens,
    request_count: e.request_count,
  }));

  // The by-key report mirrors the real Admin API for enterprise: no
  // workspace_id, so the untagged mess lands in the default workspace and
  // triggers the org-structure finding. The startup tags its keys properly —
  // its report should attribute spend cleanly and stay finding-quiet.
  const bk: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    api_key_id: e.api_key_id,
    ...(persona === "startup" ? { workspace_id: e.workspace_id } : {}),
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    cache_creation_input_tokens: e.cache_creation_input_tokens,
    request_count: e.request_count,
  }));

  const bw: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    workspace_id: e.workspace_id,
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    cache_creation_input_tokens: e.cache_creation_input_tokens,
    request_count: e.request_count,
  }));

  // Deterministic "fetched at end of month" stamp — demo.ts never reads the
  // clock, so identical inputs stay byte-identical.
  const fetchedAt = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const raw = {
    organization: {
      endpoint: "/v1/organizations/me",
      fetched_at: fetchedAt,
      response: org,
    },
    workspaces: {
      endpoint: "/v1/organizations/workspaces",
      fetched_at: fetchedAt,
      response: { data: ws },
    },
    usage_by_model: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: fetchedAt,
      results: bm,
    },
    usage_by_key: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: fetchedAt,
      results: bk,
    },
    usage_by_workspace: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: fetchedAt,
      results: bw,
    },
  };

  return { org, ws, bm, bk, bw, rawBk: bk, rawBm: bm, raw };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────
//
// Mirrors the Anthropic side: a curated per-project workload table, one
// completions entry per rule story, instead of a per-day scenario roulette.
// Enterprise projects each tell one story (mini-downgrade router, RAG bloat,
// steady batch enrichment, Monday-only evals, o1 reasoning overkill, legacy
// GPT-4, prompt bloat, caching miss) on top of an overloaded default
// project. The startup runs two clean mini-based projects. Non-completions
// services stay as light background traffic so the multi-service table is
// populated, and every cost row is derived from the same token volumes at
// pricing-table rates.

interface OaiProject {
  id: string;
  name: string;
  created_at: number;
  organization_id: string;
}

const OAI_ENT_PROJECTS: OaiProject[] = [
  { id: "proj_router", name: "Support Router" },
  { id: "proj_rag", name: "Docs Assistant" },
  { id: "proj_enrich", name: "Data Enrichment" },
  { id: "proj_evals", name: "Model Evals" },
  { id: "proj_reason", name: "Reasoning Pipeline" },
  { id: "proj_legacy", name: "Legacy Chat" },
  { id: "proj_content", name: "Content Studio" },
  { id: "proj_realtime", name: "Realtime Assistant" },
].map((p, i) => ({
  ...p,
  created_at: 1709251200 + i * 2_592_000,
  organization_id: "org_demo",
}));

const OAI_STARTUP_PROJECTS: OaiProject[] = [
  { id: "proj_app", name: "Product API" },
  { id: "proj_tools", name: "Internal Tools" },
].map((p, i) => ({
  ...p,
  created_at: 1735689600 + i * 2_592_000,
  organization_id: "org_demo",
}));

// pid undefined → default project.
interface OaiCompletionsWorkload {
  pid?: string;
  model: string;
  inp: number; // daily base input tokens
  out: number; // daily base output tokens
  reqs: number; // daily base requests
  mondayOnly?: boolean; // eval batches that only run Mondays → bursty
}

const OAI_ENT_WORKLOADS: OaiCompletionsWorkload[] = [
  // Overloaded default project: the org's main traffic never got segmented
  // → high-impact opportunity in the "Default project" bucket.
  {
    model: "gpt-4o",
    inp: 1_000_000,
    out: 150_000,
    reqs: 400,
  },
  {
    model: "gpt-4o-mini",
    inp: 500_000,
    out: 120_000,
    reqs: 500,
  },
  // Support router: o1-mini emitting tiny classification outputs → GPT-4o-mini
  // downgrade (a reasoning model on routing traffic).
  {
    pid: "proj_router",
    model: "o1-mini",
    inp: 200_000,
    out: 8_000,
    reqs: 140,
  },
  // Docs assistant: enormous retrieval context per request → RAG bloat.
  {
    pid: "proj_rag",
    model: "gpt-4o",
    inp: 700_000,
    out: 25_000,
    reqs: 25,
  },
  // Data enrichment: steady high-volume traffic → batch API (rule 4b).
  {
    pid: "proj_enrich",
    model: "gpt-4o",
    inp: 500_000,
    out: 100_000,
    reqs: 300,
  },
  // Model evals: Monday-only bursts → batch API (rule 4).
  {
    pid: "proj_evals",
    model: "gpt-4o",
    inp: 2_000_000,
    out: 200_000,
    reqs: 800,
    mondayOnly: true,
  },
  // Reasoning pipeline: o1 on short, simple outputs → reasoning overkill.
  {
    pid: "proj_reason",
    model: "o1",
    inp: 150_000,
    out: 15_000,
    reqs: 60,
  },
  // Legacy chat: still on GPT-4 → upgrade to GPT-4o.
  {
    pid: "proj_legacy",
    model: "gpt-4",
    inp: 40_000,
    out: 8_000,
    reqs: 30,
  },
  // Content studio: verbose 15k-token prompts → prompt bloat (rule 8).
  // Volumes stay under rule 2's 10M/mo RAG gate even at max profile scale,
  // so this reads as prompt bloat, not RAG territory (rule 8 defers there).
  {
    pid: "proj_content",
    model: "gpt-4o",
    inp: 120_000,
    out: 4_000,
    reqs: 8,
  },
  // Realtime assistant: big repeated context, no caching → caching (rule 0).
  {
    pid: "proj_realtime",
    model: "gpt-4o",
    inp: 400_000,
    out: 40_000,
    reqs: 70,
  },
];

const OAI_STARTUP_WORKLOADS: OaiCompletionsWorkload[] = [
  // Product API: right-sized on mini, but repeated context isn't cached —
  // the run's one deliberate (small) finding. Volumes are sized against real
  // mini pricing ($0.15/$0.60): they were originally set when prOpenAI
  // mis-resolved "gpt-4o-mini" to GPT-4o rates, which inflated this project's
  // spend ~17x and made a sub-dollar caching saving look like a real one.
  {
    pid: "proj_app",
    model: "gpt-4o-mini",
    inp: 2_600_000,
    out: 400_000,
    reqs: 1_000,
  },
  // Internal tools: small and clean. Avg input stays ~250 tok/req, well under
  // the caching rule's 2k gate, so this project keeps producing no findings.
  {
    pid: "proj_tools",
    model: "gpt-4o-mini",
    inp: 200_000,
    out: 50_000,
    reqs: 800,
  },
];

// Background traffic for the non-completions services. Costs derive from the
// volumes at realistic per-unit rates; volumes are kept small enough that
// none of the token-based rules can fire on them.
interface OaiServiceWorkload {
  pid?: string;
  service: string;
  model: string;
  tokens?: number; // daily tokens (input-only)
  seconds?: number; // daily audio seconds (whisper)
  units?: number; // daily images / sessions / store-days
  reqs: number; // daily requests
  tokenRate?: number; // $/MTok
  unitCost?: number; // $/unit
}

const OAI_ENT_SERVICES: OaiServiceWorkload[] = [
  {
    pid: "proj_rag",
    service: "embeddings",
    model: "text-embedding-3-large",
    tokens: 400_000,
    reqs: 800,
    tokenRate: 0.13,
  },
  {
    pid: "proj_realtime",
    service: "audio_speeches",
    model: "tts-1",
    tokens: 40_000,
    reqs: 60,
    tokenRate: 15,
  },
  {
    pid: "proj_realtime",
    service: "audio_transcriptions",
    model: "whisper-1",
    seconds: 7_200,
    reqs: 80,
  },
  {
    pid: "proj_content",
    service: "images",
    model: "dall-e-3",
    units: 25,
    reqs: 25,
    unitCost: 0.04,
  },
  {
    service: "moderations",
    model: "text-moderation-latest",
    tokens: 20_000,
    reqs: 300,
    tokenRate: 0,
  },
  {
    pid: "proj_rag",
    service: "vector_stores",
    model: "vector-store",
    units: 3,
    reqs: 40,
    unitCost: 0.1,
  },
  {
    pid: "proj_enrich",
    service: "code_interpreter_sessions",
    model: "code-interpreter",
    units: 12,
    reqs: 12,
    unitCost: 0.03,
  },
];

const OAI_STARTUP_SERVICES: OaiServiceWorkload[] = [
  {
    pid: "proj_app",
    service: "embeddings",
    model: "text-embedding-3-small",
    tokens: 150_000,
    reqs: 300,
    tokenRate: 0.02,
  },
  {
    pid: "proj_app",
    service: "moderations",
    model: "text-moderation-latest",
    tokens: 15_000,
    reqs: 150,
    tokenRate: 0,
  },
];

export function demoOpenAI(
  year: number,
  month: number,
  seed: number = DEMO_SEED,
  persona: DemoPersona = "enterprise",
  monthsAgo: number = 0
): OpenAIPullResult {
  const profile = newProfile(seed, persona);
  const rand = makeRand(seed ^ (year * 12 + month) ^ hashStr("oai"));
  const { scale, jitter } = profile;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthNorm = 30 / daysInMonth;
  const growth = arcMult(profile, monthsAgo);

  const projects =
    persona === "startup" ? OAI_STARTUP_PROJECTS : OAI_ENT_PROJECTS;
  const completions =
    persona === "startup" ? OAI_STARTUP_WORKLOADS : OAI_ENT_WORKLOADS;
  const services =
    persona === "startup" ? OAI_STARTUP_SERVICES : OAI_ENT_SERVICES;
  const projectName: Record<string, string> = {};
  for (const p of projects) projectName[p.id] = p.name;

  const usageRows: OpenAIUsageData["data"] = [];
  const costResults: OpenAICostsData["data"] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const isMonday = dow === 1;
    const ts = Math.floor(Date.UTC(year, month, day) / 1000);

    const dayCostResults: (typeof costResults)[0]["results"] = [];
    const pushCost = (cost: number, model: string, pid?: string) => {
      if (cost <= 0) return;
      dayCostResults.push({
        object: "organization.costs.result",
        amount: { value: parseFloat(cost.toFixed(6)), currency: "usd" },
        line_item: model,
        project_id: pid,
        project_name: pid ? projectName[pid] : undefined,
        organization_id: "org_demo",
        organization_name: profile.orgName,
      });
    };

    for (const w of completions) {
      if (w.mondayOnly && !isMonday) continue;
      const wm = isWeekend ? profile.weekendFactor : 1;
      const v = 1 - jitter / 2 + rand() * jitter;
      const mult = wm * v * scale * growth * monthNorm;

      const inp = Math.floor(w.inp * mult);
      const out = Math.floor(w.out * mult);
      const reqs = Math.max(1, Math.floor(w.reqs * mult));
      if (inp === 0 && out === 0) continue;

      usageRows.push({
        aggregation_timestamp: ts,
        n_requests: reqs,
        operation: "completions",
        snapshot_id: w.model,
        n_context_tokens_total: inp,
        n_generated_tokens_total: out,
        model: w.model,
        service: "completions",
        bucket_start_time: ts,
        project_id: w.pid,
        input_tokens: inp,
        output_tokens: out,
        num_model_requests: reqs,
      });

      // Costs API figures come from the same token volumes at pricing-table
      // rates, so cost-based and token-based views never contradict.
      pushCost(tcOpenAI(w.model, inp, out), w.model, w.pid);
    }

    for (const s of services) {
      const wm = isWeekend ? profile.weekendFactor : 1;
      const v = 1 - jitter / 2 + rand() * jitter;
      const mult = wm * v * scale * growth * monthNorm;
      const reqs = Math.max(1, Math.floor(s.reqs * mult));

      let cost = 0;
      const row: OpenAIUsageData["data"][0] = {
        aggregation_timestamp: ts,
        n_requests: reqs,
        operation: s.service,
        snapshot_id: s.model,
        n_context_tokens_total: 0,
        n_generated_tokens_total: 0,
        model: s.model,
        service: s.service,
        bucket_start_time: ts,
        project_id: s.pid,
        num_model_requests: reqs,
      };

      if (s.seconds !== undefined) {
        const seconds = Math.floor(s.seconds * mult);
        row.seconds = seconds;
        cost = (seconds / 60) * 0.006; // whisper $0.006/min
      } else if (s.tokens !== undefined) {
        const tokens = Math.floor(s.tokens * mult);
        row.n_context_tokens_total = tokens;
        row.input_tokens = tokens;
        row.output_tokens = 0;
        cost = (tokens / 1e6) * (s.tokenRate ?? 0);
      } else if (s.units !== undefined) {
        const units = Math.max(1, Math.floor(s.units * mult));
        cost = units * (s.unitCost ?? 0);
      }

      usageRows.push(row);
      pushCost(cost, s.model, s.pid);
    }

    if (dayCostResults.length > 0) {
      costResults.push({
        start_time: ts,
        end_time: ts + 86400,
        results: dayCostResults,
      });
    }
  }

  const costs: OpenAICostsData = {
    object: "page",
    data: costResults,
    has_more: false,
  };

  const org = {
    id: `org_demo_${(seed >>> 0).toString(36)}`,
    name: profile.orgName,
  };
  const fetchedAt = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const raw = {
    completions: {
      endpoint: "/v1/organization/usage/completions",
      fetched_at: fetchedAt,
      response: { data: [], has_more: false },
    },
    costs: {
      endpoint: "/v1/organization/costs",
      fetched_at: fetchedAt,
      response: costs,
    },
    projects: {
      endpoint: "/v1/organization/projects",
      fetched_at: fetchedAt,
      response: { data: projects },
    },
  };

  return {
    org,
    usage: { data: usageRows },
    costs,
    projects,
    raw,
  };
}
