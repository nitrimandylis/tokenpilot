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
  cache_read_tokens: number;
  model: string;
  api_key_id: string;
  workspace_id: string;
  request_count?: number;
}

export interface OpenAIProject {
  id: string;
  name: string;
  created_at: number;
  organization_id: string;
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
    name: "Acme Corp",
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
  return 0.5 + Math.random() * 1.0;
}

export function generateAnthropicUsageData(
  year: number,
  month: number,
  options: {
    group_by?: string[];
    limit?: number;
    page?: number;
  } = {}
): PaginatedResult<AnthropicUsageEntry> {
  const { group_by = [], limit = 1000, page = 0 } = options;
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

    const scenario = Math.random();

    for (const model of models) {
      const workspace =
        WORKSPACES[Math.floor(Math.random() * WORKSPACES.length)];
      const apiKey = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];

      let inputTokens: number;
      let outputTokens: number;
      let cacheReadTokens: number;
      let requestCount: number;

      const weekendMultiplier = isWeekend ? 0.3 : 1;

      if (scenario < 0.15) {
        const lowOutput = 50 + Math.random() * 100;
        inputTokens = Math.floor(2000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(
          lowOutput * weekendMultiplier * randomVariation()
        );
        requestCount = Math.floor(80 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(
          inputTokens * (0.02 + Math.random() * 0.03)
        );
      } else if (scenario < 0.3) {
        const highInput = 15000 + Math.random() * 10000;
        inputTokens = Math.floor(
          highInput * weekendMultiplier * randomVariation()
        );
        outputTokens = Math.floor(400 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(30 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(
          inputTokens * (0.15 + Math.random() * 0.25)
        );
      } else if (scenario < 0.45) {
        inputTokens = Math.floor(25000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(2500 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(150 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(
          inputTokens * (0.01 + Math.random() * 0.03)
        );
      } else if (scenario < 0.55) {
        inputTokens = Math.floor(8000 * weekendMultiplier * randomVariation());
        outputTokens = Math.floor(2000 * weekendMultiplier * randomVariation());
        requestCount = Math.floor(
          200 * weekendMultiplier * (isMonday ? 1.5 : 0.7)
        );
        cacheReadTokens = Math.floor(inputTokens * (0.1 + Math.random() * 0.3));
      } else if (scenario < 0.65) {
        const legacyModels = [
          "claude-3-opus-20240229",
          "claude-3-sonnet-20240229",
        ];
        const useLegacy =
          model.name ===
          legacyModels[Math.floor(Math.random() * legacyModels.length)];
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
          cacheReadTokens = Math.floor(
            inputTokens * (0.1 + Math.random() * 0.3)
          );
        }
      } else {
        inputTokens = Math.floor(
          model.baseInput * weekendMultiplier * randomVariation()
        );
        outputTokens = Math.floor(
          model.baseOutput * weekendMultiplier * randomVariation()
        );
        requestCount = Math.floor(80 * weekendMultiplier * randomVariation());
        cacheReadTokens = Math.floor(inputTokens * (0.1 + Math.random() * 0.3));
      }

      if (inputTokens === 0 && outputTokens === 0) continue;

      entries.push({
        bucket_start: dateStr,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        model: model.name,
        api_key_id: apiKey,
        workspace_id: workspace,
        request_count: requestCount,
      });
    }
  }

  return paginateArray(entries, limit, page);
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
): PaginatedResult<OpenAIUsageEntry> {
  const { endpoint, limit = 1000, page = 0 } = options;
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

    const scenario = Math.random();

    for (const service of services) {
      if (Math.random() > 0.7) continue;

      const project = PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
      const model =
        service.models[Math.floor(Math.random() * service.models.length)];
      const weekendMultiplier = isWeekend ? 0.4 : 1;

      let tokens: number;
      let cost: number;
      let numRequests: number;

      if (service.endpoint === "completions") {
        if (scenario < 0.15) {
          const lowOutput = 50 + Math.random() * 150;
          tokens = Math.floor(2500 * weekendMultiplier * randomVariation());
          const outTokens = Math.floor(
            lowOutput * weekendMultiplier * randomVariation()
          );
          cost = (tokens * 0.7 + outTokens * 0.3) * (service.baseCost / 1000);
          numRequests = Math.floor(80 * weekendMultiplier * randomVariation());
        } else if (scenario < 0.3) {
          const highInput = 15000 + Math.random() * 10000;
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

      entries.push({
        id: `usage_${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}_${Math.random().toString(36).slice(2, 10)}`,
        bucket_start_time: timestamp,
        service_tier: "standard",
        endpoint: service.endpoint,
        model,
        input_tokens: Math.floor(tokens * 0.7),
        output_tokens: Math.floor(tokens * 0.3),
        total_tokens: tokens,
        cost: parseFloat(cost.toFixed(6)),
        project_id: project,
        num_model_requests: numRequests,
      });
    }
  }

  return paginateArray(entries, limit, page);
}

export function generateOpenAICosts(
  year: number,
  month: number
): { total_cost: number; items: { name: string; cost: number }[] } {
  const items = [
    { name: "GPT-4o", cost: 847.32 + Math.random() * 200 },
    { name: "GPT-4o-mini", cost: 124.55 + Math.random() * 50 },
    { name: "o1-preview", cost: 234.1 + Math.random() * 100 },
    { name: "Embeddings", cost: 56.78 + Math.random() * 20 },
    { name: "Whisper", cost: 34.21 + Math.random() * 10 },
    { name: "DALL-E 3", cost: 89.45 + Math.random() * 30 },
    { name: "TTS", cost: 23.67 + Math.random() * 10 },
    { name: "Moderations", cost: 12.34 + Math.random() * 5 },
  ];

  const total = items.reduce((sum, item) => sum + item.cost, 0);

  return {
    total_cost: parseFloat(total.toFixed(2)),
    items: items.map((i) => ({ ...i, cost: parseFloat(i.cost.toFixed(2)) })),
  };
}

export function generateOpenAIOrg(): { id: string; name: string } {
  return {
    id: "org_abc123",
    name: "Acme Corp",
  };
}
