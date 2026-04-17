// Anthropic API Types

export interface Organization {
  id: string;
  name: string;
  display_name?: string;
  created_at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  display_name?: string;
  created_at: string;
}

export interface WorkspacesResponse {
  data: Workspace[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}

export interface UsageBucket {
  bucket_start: string;
  model?: string;
  api_key_id?: string;
  workspace_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens_cached?: number;
  uncached_input_tokens?: number;
  input_tokens_uncached?: number;
  request_count?: number;
}

export interface UsageReportResponse {
  data: Array<{
    results: UsageBucket[];
  }>;
  has_more: boolean;
  next_page?: string;
}

export interface RawEndpointData {
  endpoint: string;
  params?: Record<string, any>;
  fetched_at: string;
  response?: any;
  results?: any[];
  error?: string;
}

export interface RawAPIData {
  organization?: RawEndpointData;
  workspaces?: RawEndpointData;
  usage_by_model?: RawEndpointData;
  usage_by_key?: RawEndpointData;
  usage_by_workspace?: RawEndpointData;
}

export interface PullResult {
  org: Organization;
  ws: Workspace[];
  bm: UsageBucket[];
  bk: UsageBucket[];
  bw: UsageBucket[];
  rawBk: UsageBucket[];
  rawBm: UsageBucket[];
  raw: RawAPIData;
}
