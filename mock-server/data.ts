export interface AnthropicOrg {
  id: string;
  name: string;
  workspace_uids: string[];
  created_at: number;
}

export interface AnthropicWorkspace {
  id: string;
  name: string;
  display_name?: string;
  type: string;
  organization_id: string;
  created_at: number;
}

export interface AnthropicUsageEntry {
  bucket_start: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  model: string;
  api_key_id: string;
  workspace_id: string;
  request_count?: number;
}

// Real Admin API shape: data[] of time buckets, each with results[]
export interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageEntry[];
}

export interface OpenAIProject {
  id: string;
  name: string;
  created_at: number;
  organization_id: string;
}

export interface OpenAIUsageBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: OpenAIUsageEntry[];
}

export interface OpenAIUsageEntry {
  id: string;
  bucket_start_time: number;
  service_tier: string;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  project_id: string;
  num_model_requests?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  has_more: boolean;
  next_page?: string;
}

// --- Business profile simulation ---
// Each "analysis run" gets a randomly generated business profile (company
// size, caching habits, weekend traffic, volatility). All generators draw
// from a PRNG seeded by profile + month + endpoint, so the same month is
// reproducible within one profile but differs across profiles.

export interface BusinessProfile {
  seed: number;
  orgName: string;
  scale: number; // overall company size multiplier
  cacheAffinity: number; // multiplier on cache read rates
  weekendFactor: number; // fraction of weekday traffic kept on weekends
  volatility: number; // widens daily variation
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

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// All data generators draw from this; reseeded per generator call
let rand: () => number = Math.random;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function seedFor(
  profile: BusinessProfile,
  year: number,
  month: number,
  tag: string
): void {
  rand = mulberry32(profile.seed ^ (year * 12 + month) ^ hashStr(tag));
}

export function generateBusinessProfile(
  seed: number = Math.floor(Math.random() * 2 ** 31)
): BusinessProfile {
  const r = mulberry32(seed);
  return {
    seed,
    orgName: ORG_NAMES[Math.floor(r() * ORG_NAMES.length)],
    scale: 0.25 + r() * r() * 8, // skewed: most companies small, a few big
    cacheAffinity: 0.2 + r() * 1.6,
    weekendFactor: 0.1 + r() * 0.7,
    volatility: 0.6 + r() * 0.8,
  };
}

let activeProfile: BusinessProfile = generateBusinessProfile();

export function setActiveProfile(p: BusinessProfile): void {
  activeProfile = p;
}

export function getActiveProfile(): BusinessProfile {
  return activeProfile;
}

const WORKSPACES = ["ws_01H7XYZABCDEF12345678", "ws_01H7XYZBARK987654321"];

const API_KEYS = [
  "sk-ant-api01_aaa111bbb222ccc333",
  "sk-ant-api01_ddd444eee555fff666",
];

const PROJECTS = ["proj_abc123xyz456", "proj_def456uvw789"];

export function paginateArray<T>(
  items: T[],
  limit: number,
  page: number
): PaginatedResult<T> {
  const start = page * limit;
  const end = start + limit;
  const data = items.slice(start, end);
  const hasMore = end < items.length;

  return {
    data,
    has_more: hasMore,
    next_page: hasMore ? `page=${page + 1}` : undefined,
  };
}

export function generateAnthropicOrg(): AnthropicOrg {
  return {
    id: "org_01H7XYZ1234567890ABCD",
    name: activeProfile.orgName,
    workspace_uids: WORKSPACES,
    created_at: 1709251200,
  };
}

export function generateAnthropicWorkspaces(): AnthropicWorkspace[] {
  return [
    {
      id: "ws_01H7XYZABCDEF12345678",
      name: "Production",
      display_name: "Production",
      type: "production",
      organization_id: "org_01H7XYZ1234567890ABCD",
      created_at: 1709251200,
    },
    {
      id: "ws_01H7XYZBARK987654321",
      name: "Development",
      display_name: "Development",
      type: "development",
      organization_id: "org_01H7XYZ1234567890ABCD",
      created_at: 1711929600,
    },
  ];
}

function randomVariation(): number {
  return 0.5 + rand() * activeProfile.volatility;
}

export function generateAnthropicUsageData(
  year: number,
  month: number,
  options: {
    group_by?: string[];
    limit?: number;
    page?: number;
  } = {}
): PaginatedResult<AnthropicUsageBucket> {
  const { group_by = [], limit = 1000, page = 0 } = options;
  // Same seed regardless of group_by so the 3 parallel pulls stay consistent
  seedFor(activeProfile, year, month, "anthropic-usage");
  const scale = activeProfile.scale;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: AnthropicUsageEntry[] = [];

  const models = [
    {
      name: "claude-3-5-sonnet-20241022",
      baseInput: 8000,
      baseOutput: 2000,
      tier: "sonnet",
    },
    {
      name: "claude-3-opus-20240229",
      baseInput: 12000,
      baseOutput: 3000,
      tier: "opus",
    },
    {
      name: "claude-3-haiku-20240307",
      baseInput: 3000,
      baseOutput: 800,
      tier: "haiku",
    },
    {
      name: "claude-sonnet-4-6-20250514",
      baseInput: 7000,
      baseOutput: 1800,
      tier: "sonnet",
    },
    {
      name: "claude-opus-4-6-20250514",
      baseInput: 11000,
      baseOutput: 2800,
      tier: "opus",
    },
    {
      name: "claude-haiku-4-5-20250514",
      baseInput: 2500,
      baseOutput: 600,
      tier: "haiku",
    },
  ];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isMonday = date.getDay() === 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;

    const scenario = rand();

    for (const model of models) {
      const workspace = WORKSPACES[Math.floor(rand() * WORKSPACES.length)];
      const apiKey = API_KEYS[Math.floor(rand() * API_KEYS.length)];

      let inputTokens: number;
      let outputTokens: number;
      let cacheReadTokens: number;
      let requestCount: number;

      const weekendMultiplier = isWeekend ? activeProfile.weekendFactor : 1;

      if (scenario < 0.15) {
        const lowOutput = 50 + rand() * 100;
        inputTokens = Math.floor(2000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(
          lowOutput * weekendMultiplier * randomVariation()
        );
        requestCount = Math.floor(80 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(inputTokens * (0.02 + rand() * 0.03));
      } else if (scenario < 0.3) {
        const highInput = 15000 + rand() * 10000;
        inputTokens = Math.floor(
          highInput * weekendMultiplier * randomVariation()
        );
        outputTokens = Math.floor(400 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(30 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(inputTokens * (0.15 + rand() * 0.25));
      } else if (scenario < 0.45) {
        inputTokens = Math.floor(25000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(2500 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(150 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(inputTokens * (0.01 + rand() * 0.03));
      } else if (scenario < 0.55) {
        inputTokens = Math.floor(8000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(2000 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(
          200 * weekendMultiplier * (isMonday ? 1.5 : 0.7)
        );
        cacheReadTokens = Math.floor(inputTokens * (0.1 + rand() * 0.3));
      } else if (scenario < 0.65) {
        const legacyModels = [
          "claude-3-opus-20240229",
          "claude-3-sonnet-20240229",
        ];
        const useLegacy =
          model.name === legacyModels[Math.floor(rand() * legacyModels.length)];
        if (useLegacy) {
          inputTokens = Math.floor(
            6000 * weekendMultiplier * randomVariation()
          );
          outputTokens = Math.floor(
            1500 * weekendMultiplier * randomVariation()
          );
          requestCount = Math.floor(
            100 * weekendMultiplier * randomVariation()
          );
          cacheReadTokens = Math.floor(inputTokens * 0.1);
        } else {
          inputTokens = Math.floor(
            model.baseInput * weekendMultiplier * randomVariation()
          );
          outputTokens = Math.floor(
            model.baseOutput * weekendMultiplier * randomVariation()
          );
          requestCount = Math.floor(80 * weekendMultiplier * randomVariation());
          cacheReadTokens = Math.floor(inputTokens * (0.1 + rand() * 0.3));
        }
      } else {
        inputTokens = Math.floor(
          model.baseInput * weekendMultiplier * randomVariation()
        );
        outputTokens = Math.floor(
          model.baseOutput * weekendMultiplier * randomVariation()
        );
        requestCount = Math.floor(80 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(inputTokens * (0.1 + rand() * 0.3));
      }

      if (inputTokens === 0 && outputTokens === 0) continue;

      const scaledInput = Math.floor(inputTokens * scale);
      entries.push({
        bucket_start: dateStr,
        input_tokens: scaledInput,
        output_tokens: Math.floor(outputTokens * scale),
        cache_read_input_tokens: Math.min(
          Math.floor(cacheReadTokens * scale * activeProfile.cacheAffinity),
          Math.floor(scaledInput * 0.9)
        ),
        model: model.name,
        api_key_id: apiKey,
        workspace_id: workspace,
        request_count: Math.max(1, Math.floor(requestCount * scale)),
      });
    }
  }

  // Group flat entries into per-day buckets matching the real API shape
  const byDay = new Map<string, AnthropicUsageEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.bucket_start) ?? [];
    list.push(e);
    byDay.set(e.bucket_start, list);
  }
  const buckets: AnthropicUsageBucket[] = [...byDay.entries()].map(
    ([start, results]) => ({
      starting_at: start,
      ending_at: new Date(new Date(start).getTime() + 86400000).toISOString(),
      results,
    })
  );

  return paginateArray(buckets, limit, page);
}

export function generateOpenAIProjects(): OpenAIProject[] {
  return [
    {
      id: "proj_abc123xyz456",
      name: "Main App",
      created_at: 1709251200,
      organization_id: "org_abc123",
    },
    {
      id: "proj_def456uvw789",
      name: "Analytics Service",
      created_at: 1711929600,
      organization_id: "org_abc123",
    },
  ];
}

type OpenAIServiceEndpoint =
  | "completions"
  | "audio_speeches"
  | "audio_transcriptions"
  | "images"
  | "moderations"
  | "vector_stores"
  | "code_interpreter_sessions"
  | "embeddings";

interface ServiceConfig {
  endpoint: OpenAIServiceEndpoint;
  models: string[];
  baseTokens: number;
  baseCost: number;
}

const SERVICE_CONFIGS: ServiceConfig[] = [
  {
    endpoint: "completions",
    models: ["gpt-4o", "gpt-4o-mini", "o1-preview", "o3-mini"],
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
    models: ["text-moderation-latest", "text-moderation-007"],
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

export function generateOpenAIUsageData(
  year: number,
  month: number,
  options: {
    endpoint?: string;
    group_by?: string[];
    limit?: number;
    page?: number;
  } = {}
): PaginatedResult<OpenAIUsageBucket> {
  const { endpoint, limit = 1000, page = 0 } = options;
  // Seed includes endpoint so repeat fetches of the same service match
  seedFor(activeProfile, year, month, `openai-usage:${endpoint ?? "all"}`);
  const scale = activeProfile.scale;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: OpenAIUsageEntry[] = [];

  const services = endpoint
    ? SERVICE_CONFIGS.filter((s) => s.endpoint === endpoint)
    : SERVICE_CONFIGS;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isMonday = date.getDay() === 1;
    const timestamp = Math.floor(date.getTime() / 1000);

    const scenario = rand();

    for (const service of services) {
      if (rand() > 0.7) continue;

      const project = PROJECTS[Math.floor(rand() * PROJECTS.length)];
      const model = service.models[Math.floor(rand() * service.models.length)];
      const weekendMultiplier = isWeekend ? activeProfile.weekendFactor : 1;

      let tokens: number;
      let cost: number;
      let numRequests: number;

      if (service.endpoint === "completions") {
        if (scenario < 0.15) {
          const lowOutput = 50 + rand() * 150;
          tokens = Math.floor(2500 * weekendMultiplier * randomVariation());
          const outTokens = Math.floor(
            lowOutput * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(80 * weekendMultiplier * randomVariation());
        } else if (scenario < 0.3) {
          const highInput = 15000 + rand() * 10000;
          tokens = Math.floor(
            highInput * weekendMultiplier * randomVariation()
          );
          const outTokens = Math.floor(
            400 * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(30 * weekendMultiplier * randomVariation());
        } else if (scenario < 0.45) {
          tokens = Math.floor(25000 * weekendMultiplier * randomVariation());
          const outTokens = Math.floor(
            2500 * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(100 * weekendMultiplier * randomVariation());
        } else if (scenario < 0.55) {
          tokens = Math.floor(8000 * weekendMultiplier * randomVariation());
          const outTokens = Math.floor(
            2000 * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(
            200 * weekendMultiplier * (isMonday ? 1.5 : 0.7)
          );
        } else if (scenario < 0.65 && model.includes("o1")) {
          tokens = Math.floor(4000 * weekendMultiplier * randomVariation());
          const outTokens = Math.floor(
            300 * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(80 * weekendMultiplier * randomVariation());
        } else {
          tokens = Math.floor(
            service.baseTokens * weekendMultiplier * randomVariation()
          );
          const outTokens = Math.floor(tokens * 0.3);
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(60 * weekendMultiplier * randomVariation());
        }
      } else if (service.endpoint === "embeddings") {
        tokens = Math.floor(
          service.baseTokens * weekendMultiplier * randomVariation()
        );
        cost = tokens * (service.baseCost / 1000);
        numRequests = Math.floor(100 * weekendMultiplier * randomVariation());
      } else if (service.endpoint === "audio_transcriptions") {
        const minutes = Math.floor(
          (service.baseTokens * weekendMultiplier * randomVariation()) / 60
        );
        cost = minutes * 0.006;
        numRequests = Math.floor(20 * weekendMultiplier * randomVariation());
        tokens = minutes * 60;
      } else if (service.endpoint === "audio_speeches") {
        const chars = Math.floor(
          service.baseTokens * weekendMultiplier * randomVariation()
        );
        cost = chars * (service.baseCost / 1000);
        numRequests = Math.floor(30 * weekendMultiplier * randomVariation());
        tokens = chars;
      } else {
        tokens = Math.floor(
          service.baseTokens * weekendMultiplier * randomVariation()
        );
        cost = tokens * (service.baseCost / 1000);
        numRequests = Math.floor(20 * weekendMultiplier * randomVariation());
      }

      if (cost === 0 && tokens === 0) continue;

      const scaledTokens = Math.floor(tokens * scale);
      entries.push({
        id: `usage_${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}_${rand().toString(36).slice(2, 10)}`,
        bucket_start_time: timestamp,
        service_tier: "standard",
        endpoint: service.endpoint,
        model,
        input_tokens: Math.floor(scaledTokens * 0.7),
        output_tokens: Math.floor(scaledTokens * 0.3),
        total_tokens: scaledTokens,
        cost: parseFloat((cost * scale).toFixed(6)),
        project_id: project,
        num_model_requests: Math.max(1, Math.floor(numRequests * scale)),
      });
    }
  }

  // Group flat entries into per-day buckets matching the real API shape
  const byDay = new Map<number, OpenAIUsageEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.bucket_start_time) ?? [];
    list.push(e);
    byDay.set(e.bucket_start_time, list);
  }
  const buckets: OpenAIUsageBucket[] = [...byDay.entries()].map(
    ([start, results]) => ({
      object: "bucket",
      start_time: start,
      end_time: start + 86400,
      results,
    })
  );

  return paginateArray(buckets, limit, page);
}

export function generateOpenAICosts(
  year: number,
  month: number
): {
  object: string;
  data: Array<{
    object: string;
    start_time: number;
    end_time: number;
    results: Array<{
      object: string;
      amount: { value: number; currency: string };
      line_item: string;
      project_id: string;
      project_name: string;
      organization_id: string;
      organization_name: string;
    }>;
  }>;
  has_more: boolean;
} {
  const lineItems = [
    { name: "gpt-4o", baseDaily: 28.2 },
    { name: "gpt-4o-mini", baseDaily: 4.1 },
    { name: "o1-preview", baseDaily: 7.8 },
    { name: "text-embedding-3-small", baseDaily: 1.9 },
    { name: "whisper-1", baseDaily: 1.1 },
    { name: "dall-e-3", baseDaily: 3.0 },
    { name: "tts-1", baseDaily: 0.8 },
    { name: "omni-moderation-latest", baseDaily: 0.4 },
  ];

  seedFor(activeProfile, year, month, "openai-costs");
  const scale = activeProfile.scale;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const start = Math.floor(new Date(year, month, day).getTime() / 1000);
    const end = Math.floor(new Date(year, month, day + 1).getTime() / 1000);

    const results = lineItems.map((item, i) => ({
      object: "organization.costs.result",
      amount: {
        value: parseFloat(
          (item.baseDaily * scale * (0.7 + rand() * 0.6)).toFixed(4)
        ),
        currency: "usd",
      },
      line_item: item.name,
      project_id: PROJECTS[i % PROJECTS.length],
      project_name:
        i % PROJECTS.length === 0 ? "Main App" : "Analytics Service",
      organization_id: "org_abc123",
      organization_name: activeProfile.orgName,
    }));

    data.push({
      object: "bucket",
      start_time: start,
      end_time: end,
      results,
    });
  }

  return { object: "page", data, has_more: false };
}

export function generateOpenAIOrg(): { id: string; name: string } {
  return {
    id: "org_abc123",
    name: activeProfile.orgName,
  };
}
