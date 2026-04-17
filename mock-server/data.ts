export interface AnthropicOrg {
  id: string;
  name: string;
  workspace_uids: string[];
  created_at: number;
}

export interface AnthropicWorkspace {
  id: string;
  name: string;
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
}

export function generateAnthropicOrg(): AnthropicOrg {
  return {
    id: "org_01H7XYZ1234567890ABCD",
    name: "Acme Corp",
    workspace_uids: ["ws_01H7XYZABCDEF12345678", "ws_01H7XYZBARK987654321"],
    created_at: 1709251200,
  };
}

export function generateAnthropicWorkspaces(): AnthropicWorkspace[] {
  return [
    {
      id: "ws_01H7XYZABCDEF12345678",
      name: "Production",
      type: "production",
      organization_id: "org_01H7XYZ1234567890ABCD",
      created_at: 1709251200,
    },
    {
      id: "ws_01H7XYZBARK987654321",
      name: "Development",
      type: "development",
      organization_id: "org_01H7XYZ1234567890ABCD",
      created_at: 1711929600,
    },
  ];
}

export function generateAnthropicUsageData(
  year: number,
  month: number
): AnthropicUsageEntry[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: AnthropicUsageEntry[] = [];

  const models = [
    { name: "claude-3-5-sonnet-20241022", baseInput: 8000, baseOutput: 2000 },
    { name: "claude-3-opus-20240229", baseInput: 12000, baseOutput: 3000 },
    { name: "claude-3-haiku-20240307", baseInput: 3000, baseOutput: 800 },
    { name: "claude-3-sonnet-20240229", baseInput: 6000, baseOutput: 1500 },
  ];

  const workspaces = ["ws_01H7XYZABCDEF12345678", "ws_01H7XYZBARK987654321"];
  const apiKeys = [
    "sk-ant-api01_aaa111bbb222ccc333",
    "sk-ant-api01_ddd444eee555fff666",
  ];

  for (let day = 1; day <= daysInMonth; day++) {
    const isWeekend =
      new Date(year, month, day).getDay() === 0 ||
      new Date(year, month, day).getDay() === 6;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`;

    for (const model of models) {
      const workspace =
        workspaces[Math.floor(Math.random() * workspaces.length)];
      const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

      const weekendMultiplier = isWeekend ? 0.3 : 1;
      const randomVariation = 0.7 + Math.random() * 0.6;

      const inputTokens = Math.floor(
        model.baseInput * weekendMultiplier * randomVariation
      );
      const outputTokens = Math.floor(
        model.baseOutput * weekendMultiplier * randomVariation
      );
      const cacheReadTokens = Math.floor(
        inputTokens * (0.1 + Math.random() * 0.4)
      );

      entries.push({
        bucket_start: dateStr,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        model: model.name,
        api_key_id: apiKey,
        workspace_id: workspace,
      });
    }
  }

  return entries;
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

export function generateOpenAIUsageData(
  year: number,
  month: number
): OpenAIUsageEntry[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: OpenAIUsageEntry[] = [];

  const services = [
    {
      endpoint: "completions",
      model: "gpt-4o",
      baseCost: 0.015,
      baseTokens: 15000,
    },
    {
      endpoint: "completions",
      model: "gpt-4o-mini",
      baseCost: 0.003,
      baseTokens: 8000,
    },
    {
      endpoint: "completions",
      model: "o1-preview",
      baseCost: 0.05,
      baseTokens: 20000,
    },
    {
      endpoint: "embeddings",
      model: "text-embedding-3-large",
      baseCost: 0.00013,
      baseTokens: 5000,
    },
    {
      endpoint: "audio_speeches",
      model: "tts-1",
      baseCost: 0.03,
      baseTokens: 1000,
    },
    {
      endpoint: "audio_transcriptions",
      model: "whisper-1",
      baseCost: 0.006,
      baseTokens: 2000,
    },
    { endpoint: "images", model: "dall-e-3", baseCost: 0.04, baseTokens: 500 },
    {
      endpoint: "moderations",
      model: "text-moderation-latest",
      baseCost: 0.0001,
      baseTokens: 3000,
    },
  ];

  const projects = ["proj_abc123xyz456", "proj_def456uvw789"];

  for (let day = 1; day <= daysInMonth; day++) {
    const isWeekend =
      new Date(year, month, day).getDay() === 0 ||
      new Date(year, month, day).getDay() === 6;
    const date = new Date(year, month, day, 12, 0, 0);
    const timestamp = Math.floor(date.getTime() / 1000);

    for (const service of services) {
      if (Math.random() > 0.7) continue;

      const project = projects[Math.floor(Math.random() * projects.length)];
      const weekendMultiplier = isWeekend ? 0.4 : 1;
      const randomVariation = 0.6 + Math.random() * 0.8;

      const tokens = Math.floor(
        service.baseTokens * weekendMultiplier * randomVariation
      );
      const cost = tokens * (service.baseCost / 1000);

      entries.push({
        id: `usage_${year}${String(month + 1).padStart(2, "0")}${String(day).padStart(2, "0")}_${Math.random().toString(36).slice(2, 10)}`,
        bucket_start_time: timestamp,
        service_tier: "standard",
        endpoint: service.endpoint,
        model: service.model,
        input_tokens: Math.floor(tokens * 0.7),
        output_tokens: Math.floor(tokens * 0.3),
        total_tokens: tokens,
        cost: parseFloat(cost.toFixed(6)),
        project_id: project,
      });
    }
  }

  return entries;
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
