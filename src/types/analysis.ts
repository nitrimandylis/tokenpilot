// Analysis & Report Types

import { Organization } from "@/types/anthropic";

// Anthropic Model Tiers
export enum AnthropicModelTier {
  OPUS = "opus",
  SONNET = "sonnet",
  HAIKU = "haiku",
}

// OpenAI Model Tiers
export enum OpenAIModelTier {
  O1 = "o1",
  O3 = "o3",
  GPT4O = "gpt-4o",
  GPT4O_MINI = "gpt-4o-mini",
  GPT4_TURBO = "gpt-4-turbo",
  GPT4 = "gpt-4",
  GPT3_5 = "gpt-3.5-turbo",
}

export enum Severity {
  CRITICAL = "critical",
  WARNING = "warning",
  INFO = "info",
  OK = "ok",
}

export enum AnthropicCategory {
  MODEL_DOWNGRADE_HAIKU = "Model Downgrade → Haiku",
  MODEL_DOWNGRADE_SONNET = "Model Downgrade → Sonnet",
  RAG_OPTIMIZATION = "RAG Optimization",
  PROMPT_CACHING = "Prompt Caching",
  PROMPT_OPTIMIZATION = "Prompt Optimization",
  BATCH_API_MIGRATION = "Batch API Migration",
  MODEL_UPGRADE = "Model Upgrade",
  WORKSPACE_ORGANIZATION = "Workspace Organization",
}

export enum OpenAICategory {
  MODEL_DOWNGRADE_MINI = "Model Downgrade → GPT-4o-mini",
  MODEL_DOWNGRADE_4O = "Model Downgrade → GPT-4o",
  RAG_OPTIMIZATION = "RAG Optimization",
  PROMPT_CACHING = "Prompt Caching",
  PROMPT_OPTIMIZATION = "Prompt Optimization",
  BATCH_API_MIGRATION = "Batch API Migration",
  MODEL_UPGRADE = "Model Upgrade",
  REASONING_MODEL_OVERKILL = "Reasoning Model Overkill",
  HIGH_IMPACT_OPPORTUNITY = "High-Impact Opportunity",
  PROJECT_ORGANIZATION = "Project Organization",
}

// Backward compatibility
export type Category = AnthropicCategory | OpenAICategory;

export interface PricingInfo {
  i: number; // input $/MTok
  o: number; // output $/MTok
  l: string; // label
  t: AnthropicModelTier | OpenAIModelTier; // tier
  g: number; // generation
}

export interface TemporalPattern {
  burstiness: number;
  consistency: number;
  batchCandidate: boolean;
  meanDaily: number;
  // Share of total requests landing on the top-2 weekdays (0-1). High values
  // mean a weekly cadence — a scheduled job, not interactive traffic.
  weekdayConcentration?: number;
  // Names of those dominant weekdays, set only when the cadence is real
  // (the top weekday recurs on 3+ distinct dates). Drives rule reason text.
  dominantWeekdays?: string[];
  // Mean weekend volume as a share of mean weekday volume. ~1 means the
  // workload runs flat through weekends (machine-driven, batchable);
  // well below 1 means human-driven interactive traffic.
  weekendParity?: number;
}

export interface AggregatedRow {
  model: string;
  kid?: string; // api_key_id
  wid?: string; // workspace_id
  inp: number; // input tokens
  out: number; // output tokens
  cached: number; // cache read tokens
  cacheCreated: number; // cache write tokens
  reqs: number;
  activeDays: number;
}

// Which engine surfaced a finding in a consensus run. "rules" = deterministic
// rule engine; "llm" = AI-spotted (priced deterministically); "both" = found
// independently by both engines. Optional so reports stored before consensus
// runs existed still parse.
export type FindingSource = "rules" | "llm" | "both";

// One detection signal behind a rule finding: its confidence weight, whether
// the row met it, and a short human-readable label for the "Based on:" trail.
export interface FindingSignal {
  weight: number;
  met: boolean;
  label: string;
}

export interface Finding {
  id: string;
  name: string;
  ws: string; // workspace name
  model: string;
  ml: string; // model label
  inp: number;
  out: number;
  cached: number;
  reqs: number;
  ao: number; // avg output tokens
  ai: number; // avg input tokens
  ratio: number; // input:output ratio
  cr: number; // cache rate
  cur: number; // current cost/mo
  opt: number; // optimized cost/mo
  sav: number; // savings/mo
  reason: string;
  action: string;
  sev: Severity;
  cat: AnthropicCategory | OpenAICategory;
  conf: number; // confidence score 0-1
  impact: string;
  activeDays: number;
  temporal: TemporalPattern;
  source?: FindingSource;
  signals?: FindingSignal[];
}

export interface WorkspaceSpend {
  id: string;
  name: string;
  spend: number;
}

// Which engine produced a report's findings. "rules" = deterministic rule
// engine; "hybrid" = consensus run (rules + NVIDIA NIM LLM augmentation);
// "llm" stays valid so reports stored by the old LLM-replaces-rules mode
// still parse and render.
export type AnalysisEngine = "rules" | "llm" | "hybrid";

// Token usage of the NIM analysis call itself, for the ROI footer on
// LLM-engine reports.
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface Report {
  org: Organization;
  spend: number;
  savings: number;
  tokens: number;
  findings: Finding[];
  wss: WorkspaceSpend[];
  keys: number;
  wc: number; // workspace count
  critCount: number;
  warnCount: number;
  infoCount: number;
  highConfSavings: number;
  // Optional so reports stored before these fields existed still parse.
  engine?: AnalysisEngine;
  notice?: string; // e.g. LLM-fallback notice, shown in the report header
  llmUsage?: LlmUsage; // only set on engine === "llm" reports
}
