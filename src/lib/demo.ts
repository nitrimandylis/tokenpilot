import type { PullResult, UsageBucket, Organization, Workspace } from "@/types";
import type {
  OpenAIPullResult,
  OpenAIUsageData,
  OpenAICostsData,
} from "@/lib/openai/api";

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
  scale: number;
  cacheAffinity: number;
  weekendFactor: number;
  volatility: number;
}

const ORG_NAMES = [
  "Acme Corp",
  "Northwind Labs",
  "Vertex Dynamics",
  "BlueHarbor AI",
  "Quantra Systems",
  "Helio Industries",
  "Mosswood Software",
  "Ironclad Analytics",
  "Skyline Robotics",
  "Cobalt & Finch",
];

function newProfile(seed: number): BusinessProfile {
  const r = makeRand(seed);
  return {
    orgName: ORG_NAMES[Math.floor(r() * ORG_NAMES.length)],
    scale: 0.4 + r() * r() * 7,
    cacheAffinity: 0.2 + r() * 1.6,
    weekendFactor: 0.1 + r() * 0.7,
    volatility: 0.6 + r() * 0.8,
  };
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

const ANTH_WORKSPACES: Workspace[] = [
  {
    id: "ws_prod",
    name: "Production",
    display_name: "Production",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "ws_dev",
    name: "Development",
    display_name: "Development",
    created_at: "2024-03-01T00:00:00Z",
  },
];

const ANTH_API_KEYS = ["key_aaa111bbb222", "key_ccc333ddd444"];

const ANTH_MODELS = [
  { name: "claude-3-5-sonnet-20241022", inp: 8000, out: 2000 },
  { name: "claude-3-opus-20240229", inp: 12000, out: 3000 },
  { name: "claude-3-haiku-20240307", inp: 3000, out: 800 },
  { name: "claude-sonnet-4-6-20250514", inp: 7000, out: 1800 },
  { name: "claude-opus-4-6-20250514", inp: 11000, out: 2800 },
  { name: "claude-haiku-4-5-20250514", inp: 2500, out: 600 },
];

interface AnthEntry {
  bucket_start: string;
  model: string;
  api_key_id: string;
  workspace_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  request_count: number;
}

function genAnthropicEntries(
  profile: BusinessProfile,
  seed: number,
  year: number,
  month: number
): AnthEntry[] {
  const rand = makeRand(seed ^ (year * 12 + month) ^ hashStr("anth"));
  const { scale } = profile;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: AnthEntry[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isMonday = date.getDay() === 1;
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;
    const scenario = rand();

    for (const m of ANTH_MODELS) {
      const ws =
        ANTH_WORKSPACES[Math.floor(rand() * ANTH_WORKSPACES.length)].id;
      const key = ANTH_API_KEYS[Math.floor(rand() * ANTH_API_KEYS.length)];
      const wm = isWeekend ? profile.weekendFactor : 1;
      const v = 0.5 + rand() * profile.volatility;

      let inp: number, out: number, cache: number, reqs: number;

      if (scenario < 0.15) {
        // Low output ratio → model downgrade candidate
        inp = Math.floor(2000 * wm * v * scale);
        out = Math.floor((50 + rand() * 100) * wm * v * scale);
        reqs = Math.floor(80 * wm * v * scale);
        cache = Math.floor(inp * (0.02 + rand() * 0.03));
      } else if (scenario < 0.3) {
        // High input:output → RAG context bloat candidate
        inp = Math.floor((15000 + rand() * 10000) * wm * v * scale);
        out = Math.floor(400 * wm * v * scale);
        reqs = Math.floor(30 * wm * v * scale);
        cache = Math.floor(inp * (0.15 + rand() * 0.25));
      } else if (scenario < 0.45) {
        // High volume, low cache → prompt caching miss candidate
        inp = Math.floor(25000 * wm * v * scale);
        out = Math.floor(2500 * wm * v * scale);
        reqs = Math.floor(150 * wm * v * scale);
        cache = Math.floor(inp * (0.01 + rand() * 0.03));
      } else if (scenario < 0.55) {
        // Bursty Monday pattern → batch API candidate
        inp = Math.floor(8000 * wm * v * scale);
        out = Math.floor(2000 * wm * v * scale);
        reqs = Math.floor(200 * wm * (isMonday ? 1.5 : 0.7) * scale);
        cache = Math.floor(inp * (0.1 + rand() * 0.3) * profile.cacheAffinity);
      } else {
        // Baseline usage
        inp = Math.floor(m.inp * wm * v * scale);
        out = Math.floor(m.out * wm * v * scale);
        reqs = Math.floor(80 * wm * v * scale);
        cache = Math.floor(inp * (0.1 + rand() * 0.3) * profile.cacheAffinity);
      }

      if (inp === 0 && out === 0) continue;

      entries.push({
        bucket_start: ds,
        model: m.name,
        api_key_id: key,
        workspace_id: ws,
        input_tokens: inp,
        output_tokens: out,
        cache_read_input_tokens: Math.min(cache, Math.floor(inp * 0.9)),
        request_count: Math.max(1, reqs),
      });
    }
  }

  return entries;
}

export function demoAnthropic(year: number, month: number): PullResult {
  const seed = Date.now() & 0x7fffffff;
  const profile = newProfile(seed);

  const org: Organization = { id: "demo_org_01", name: profile.orgName };
  const ws = ANTH_WORKSPACES;
  const entries = genAnthropicEntries(profile, seed, year, month);

  const bm: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    request_count: e.request_count,
  }));

  const bk: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    api_key_id: e.api_key_id,
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    request_count: e.request_count,
  }));

  const bw: UsageBucket[] = entries.map((e) => ({
    bucket_start: e.bucket_start,
    model: e.model,
    workspace_id: e.workspace_id,
    input_tokens: e.input_tokens,
    output_tokens: e.output_tokens,
    cache_read_input_tokens: e.cache_read_input_tokens,
    request_count: e.request_count,
  }));

  const now = new Date().toISOString();
  const raw = {
    organization: {
      endpoint: "/v1/organizations/me",
      fetched_at: now,
      response: org,
    },
    workspaces: {
      endpoint: "/v1/organizations/workspaces",
      fetched_at: now,
      response: { data: ws },
    },
    usage_by_model: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: now,
      results: bm,
    },
    usage_by_key: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: now,
      results: bk,
    },
    usage_by_workspace: {
      endpoint: "/v1/organizations/usage_report/messages",
      fetched_at: now,
      results: bw,
    },
  };

  return { org, ws, bm, bk, bw, rawBk: bk, rawBm: bm, raw };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

const OAI_PROJECTS = [
  {
    id: "proj_main",
    name: "Main App",
    created_at: 1709251200,
    organization_id: "org_demo",
  },
  {
    id: "proj_analytics",
    name: "Analytics Service",
    created_at: 1711929600,
    organization_id: "org_demo",
  },
];

interface ServiceConfig {
  endpoint: string;
  models: string[];
  baseTokens: number;
  baseCost: number;
}

const OAI_SERVICES: ServiceConfig[] = [
  {
    endpoint: "completions",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    baseTokens: 15000,
    baseCost: 0.015,
  },
  {
    endpoint: "embeddings",
    models: ["text-embedding-3-large", "text-embedding-3-small"],
    baseTokens: 5000,
    baseCost: 0.00013,
  },
  {
    endpoint: "audio_speeches",
    models: ["tts-1", "tts-1-hd"],
    baseTokens: 1000,
    baseCost: 0.03,
  },
  {
    endpoint: "audio_transcriptions",
    models: ["whisper-1"],
    baseTokens: 2000,
    baseCost: 0.006,
  },
  {
    endpoint: "images",
    models: ["dall-e-3", "dall-e-2"],
    baseTokens: 500,
    baseCost: 0.04,
  },
  {
    endpoint: "moderations",
    models: ["text-moderation-latest"],
    baseTokens: 3000,
    baseCost: 0.0001,
  },
  {
    endpoint: "vector_stores",
    models: ["vector-store"],
    baseTokens: 0,
    baseCost: 0.01,
  },
  {
    endpoint: "code_interpreter_sessions",
    models: ["code-interpreter"],
    baseTokens: 10000,
    baseCost: 0.02,
  },
];

export function demoOpenAI(year: number, month: number): OpenAIPullResult {
  const seed = Date.now() & 0x7fffffff;
  const profile = newProfile(seed);
  const rand = makeRand(seed ^ (year * 12 + month) ^ hashStr("oai"));
  const { scale } = profile;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const usageRows: OpenAIUsageData["data"] = [];
  const costResults: OpenAICostsData["data"] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isMonday = date.getDay() === 1;
    const ts = Math.floor(date.getTime() / 1000);
    const scenario = rand();

    const dayCostResults: (typeof costResults)[0]["results"] = [];

    for (const svc of OAI_SERVICES) {
      if (rand() > 0.75) continue;

      const project = OAI_PROJECTS[Math.floor(rand() * OAI_PROJECTS.length)];
      const model = svc.models[Math.floor(rand() * svc.models.length)];
      const wm = isWeekend ? profile.weekendFactor : 1;
      const v = 0.5 + rand() * profile.volatility;

      let tokens: number, cost: number, reqs: number;

      if (svc.endpoint === "completions") {
        if (scenario < 0.15) {
          // Low output → model downgrade candidate
          tokens = Math.floor(2500 * wm * v * scale);
          cost = tokens * (svc.baseCost / 1000);
          reqs = Math.floor(80 * wm * v * scale);
        } else if (scenario < 0.3) {
          // High input → RAG bloat candidate
          tokens = Math.floor((15000 + rand() * 10000) * wm * v * scale);
          cost = tokens * (svc.baseCost / 1000);
          reqs = Math.floor(30 * wm * v * scale);
        } else if (scenario < 0.45) {
          // High volume → batch API candidate
          tokens = Math.floor(25000 * wm * v * scale);
          cost = tokens * (svc.baseCost / 1000);
          reqs = Math.floor(200 * wm * (isMonday ? 1.5 : 0.7) * scale);
        } else {
          tokens = Math.floor(svc.baseTokens * wm * v * scale);
          cost = tokens * (svc.baseCost / 1000);
          reqs = Math.floor(60 * wm * v * scale);
        }
      } else if (svc.endpoint === "audio_transcriptions") {
        const minutes = Math.floor((svc.baseTokens * wm * v * scale) / 60);
        cost = minutes * 0.006;
        reqs = Math.floor(20 * wm * v * scale);
        tokens = minutes * 60;
      } else {
        tokens = Math.floor(svc.baseTokens * wm * v * scale);
        cost = tokens * (svc.baseCost / 1000);
        reqs = Math.floor(20 * wm * v * scale);
      }

      if (cost === 0 && tokens === 0) continue;

      usageRows.push({
        aggregation_timestamp: ts,
        n_requests: Math.max(1, reqs),
        operation: svc.endpoint,
        snapshot_id: model,
        n_context_tokens_total: Math.floor(tokens * 0.7),
        n_generated_tokens_total: Math.floor(tokens * 0.3),
        model,
        service: svc.endpoint,
        bucket_start_time: ts,
        project_id: project.id,
        input_tokens: Math.floor(tokens * 0.7),
        output_tokens: Math.floor(tokens * 0.3),
        num_model_requests: Math.max(1, reqs),
      });

      dayCostResults.push({
        object: "organization.costs.result",
        amount: { value: parseFloat(cost.toFixed(6)), currency: "usd" },
        line_item: model,
        project_id: project.id,
        project_name: project.name,
        organization_id: "org_demo",
        organization_name: profile.orgName,
      });
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

  const org = { id: "org_demo", name: profile.orgName };
  const now = new Date().toISOString();
  const raw = {
    completions: {
      endpoint: "/v1/organization/usage/completions",
      fetched_at: now,
      response: { data: [], has_more: false },
    },
    costs: {
      endpoint: "/v1/organization/costs",
      fetched_at: now,
      response: costs,
    },
    projects: {
      endpoint: "/v1/organization/projects",
      fetched_at: now,
      response: { data: OAI_PROJECTS },
    },
  };

  return {
    org,
    usage: { data: usageRows },
    costs,
    projects: OAI_PROJECTS,
    raw,
  };
}
