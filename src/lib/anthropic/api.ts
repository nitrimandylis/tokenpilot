/* ═══════════════════ API ═══════════════════ */

import type {
  Organization,
  Workspace,
  WorkspacesResponse,
  UsageBucket,
  UsageReportResponse,
  RawAPIData,
  PullResult,
} from "@/types";

/* ═══════════════════ ERROR HANDLING ═══════════════════ */

/**
 * Parse and format Anthropic API errors with user-friendly messages
 */
function handleAnthropicError(status: number, responseText: string): Error {
  const errorMessages: Record<number, string> = {
    400: "Invalid request format. Please check your API configuration and try again.",
    401: "Authentication failed. Your API key may be invalid or expired. Please verify your Anthropic Admin API key.",
    402: "Billing issue detected. Please check your payment details in the Anthropic Console: https://console.anthropic.com",
    403: "Permission denied. Your API key doesn't have access to the Admin API. Ensure you're using an Admin API key, not a regular API key.",
    404: "Resource not found. The requested endpoint or organization may not exist.",
    413: "Request too large. Maximum request size is 32 MB.",
    429: "Rate limit exceeded. Please slow down your requests.",
    500: "Anthropic server error. Please try again in a few moments.",
    529: "Anthropic API is temporarily overloaded. Please retry in a few minutes.",
  };

  const baseMessage = errorMessages[status] || `API error (${status})`;

  // Try to parse error details from response
  try {
    const errorData = JSON.parse(responseText);
    const detail = errorData.error?.message || errorData.message || "";
    return new Error(`${baseMessage}${detail ? ` Details: ${detail}` : ""}`);
  } catch {
    // If not JSON, include first 200 chars of response
    const snippet = responseText.slice(0, 200);
    return new Error(`${baseMessage}${snippet ? ` (${snippet})` : ""}`);
  }
}

/**
 * Make an authenticated API call to the Anthropic API via proxy
 * @param key - Admin API key for authentication
 * @param path - API endpoint path (e.g., "/v1/organizations/me")
 * @param params - Optional query parameters
 * @returns Parsed JSON response
 * @throws Error with RATE_LIMIT: prefix for 429 errors, or standard error message for other failures
 */
export async function call(
  key: string,
  path: string,
  params: Record<string, any> = {}
): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.append(k, v);
  }
  const r = await fetch(`/api/anthropic${path}?${qs}`, {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) {
    const t = await r.text();

    // Handle 429 rate limiting with special format for retry logic
    if (r.status === 429) {
      const retryAfter = r.headers.get("retry-after");
      const resetTime = r.headers.get("x-ratelimit-reset");
      let waitTime = 60; // Default to 60 seconds

      if (retryAfter) {
        waitTime = parseInt(retryAfter, 10);
      } else if (resetTime) {
        const resetDate = new Date(resetTime);
        const now = new Date();
        waitTime = Math.ceil((resetDate.getTime() - now.getTime()) / 1000);
      }

      throw new Error(
        `RATE_LIMIT:${waitTime}:Too many requests. Please wait ${Math.ceil(waitTime / 60)} minute(s) before retrying. See Claude API rate limits: https://docs.anthropic.com/en/api/rate-limits`
      );
    }

    // Handle all other errors with user-friendly messages
    throw handleAnthropicError(r.status, t);
  }
  return r.json();
}

/**
 * Flatten nested bucket structure from API response
 * @param response - Usage report response with nested bucket structure
 * @returns Flattened array of usage buckets
 */
export function flattenBuckets(response: UsageReportResponse): UsageBucket[] {
  if (!response || !response.data) return [];
  const allResults: UsageBucket[] = [];
  for (const bucket of response.data) {
    if (bucket.results && Array.isArray(bucket.results)) {
      allResults.push(...bucket.results);
    }
  }
  return allResults;
}

/**
 * Fetch all pages of usage data with pagination
 * @param key - Admin API key
 * @param endpoint - API endpoint path
 * @param params - Query parameters
 * @returns Flattened array of all usage buckets across all pages
 */
export async function fetchAllPages(
  key: string,
  endpoint: string,
  params: Record<string, any>
): Promise<UsageBucket[]> {
  let allResults: UsageBucket[] = [];
  let nextPage: string | null = null;
  let pageCount = 0;
  const maxPages = 100; // Safety limit

  do {
    pageCount++;
    const queryParams = { ...params };
    if (nextPage) {
      queryParams.page = nextPage;
    }

    const response: UsageReportResponse = await call(
      key,
      endpoint,
      queryParams
    );
    const pageResults = flattenBuckets(response);
    allResults.push(...pageResults);

    nextPage = response.has_more ? response.next_page || null : null;
  } while (nextPage && pageCount < maxPages);

  return allResults;
}

/**
 * Get date range for a specific month/year (default: current month to date)
 * @param year - Year (e.g., 2026)
 * @param month - Month (0-indexed: 0 = January, 11 = December)
 * @returns Object with starting_at and ending_at ISO timestamps
 */
export function getMonthDateRange(
  year: number,
  month: number
): { starting_at: string; ending_at: string } {
  // month is 0-indexed (0 = January, 11 = December)
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Use UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endDate = isCurrentMonth
    ? now
    : new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return {
    starting_at: startDate.toISOString().split(".")[0] + "Z",
    ending_at: endDate.toISOString().split(".")[0] + "Z",
  };
}

/**
 * Pull all usage data from Anthropic API for a given month
 * Fetches organization info, workspaces, and usage reports grouped by model, key, and workspace
 * @param key - Admin API key
 * @param log - Logging function for progress updates
 * @param year - Year to fetch data for
 * @param month - Month to fetch data for (0-indexed)
 * @returns PullResult with organization, workspaces, usage buckets, and raw API responses
 * @throws Error if authentication fails or rate limit is exceeded
 */
export async function pull(
  key: string,
  log: (msg: string) => void,
  year: number,
  month: number
): Promise<PullResult> {
  const { starting_at: s, ending_at: e } = getMonthDateRange(year, month);
  const raw: RawAPIData = {}; // Store full API responses
  const ts = () => new Date().toISOString();

  log("Authenticating...");
  let org: Organization = { id: "", name: "Organization" };
  try {
    const r = await call(key, "/v1/organizations/me");
    org = r;
    raw.organization = {
      endpoint: "/v1/organizations/me",
      fetched_at: ts(),
      response: r,
    };
  } catch (x: any) {
    raw.organization = {
      endpoint: "/v1/organizations/me",
      fetched_at: ts(),
      error: x.message,
    };
    if (
      x.message.includes("403") ||
      x.message.includes("Forbidden") ||
      x.message.toLowerCase().includes("admin")
    ) {
      throw new Error(
        "This endpoint requires an Admin API key. Regular API keys (sk-ant-api-...) cannot access organization data. Please use an Admin API key (sk-ant-admin-...)."
      );
    }
    if (x.message.includes("401") || x.message.includes("Unauthorized")) {
      throw new Error(
        "Invalid API key. Please check your Admin API key and try again."
      );
    }
    throw x;
  }

  log("Fetching workspaces...");
  let ws: Workspace[] = [];
  try {
    const r: WorkspacesResponse = await call(
      key,
      "/v1/organizations/workspaces",
      {
        limit: 100,
      }
    );
    ws = r.data || [];
    raw.workspaces = {
      endpoint: "/v1/organizations/workspaces",
      params: { limit: 100 },
      fetched_at: ts(),
      response: r,
    };
  } catch (x: any) {
    raw.workspaces = {
      endpoint: "/v1/organizations/workspaces",
      fetched_at: ts(),
      error: x.message,
    };
  }

  log("Pulling usage data (3 parallel requests)...");
  // Fetch all usage data in parallel for speed
  const [bmResult, bkResult, bwResult] = await Promise.allSettled([
    fetchAllPages(key, "/v1/organizations/usage_report/messages", {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      "group_by[]": "model",
    }),
    fetchAllPages(key, "/v1/organizations/usage_report/messages", {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      "group_by[]": ["model", "api_key_id"],
    }),
    fetchAllPages(key, "/v1/organizations/usage_report/messages", {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      "group_by[]": ["workspace_id", "model"],
    }),
  ]);

  // Process results
  const bm: UsageBucket[] =
    bmResult.status === "fulfilled" ? bmResult.value : [];
  raw.usage_by_model = {
    endpoint: "/v1/organizations/usage_report/messages",
    params: {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      group_by: "model",
    },
    fetched_at: ts(),
    ...(bmResult.status === "fulfilled"
      ? { results: bm }
      : { error: bmResult.reason?.message }),
  };

  const bk: UsageBucket[] =
    bkResult.status === "fulfilled" ? bkResult.value : [];
  raw.usage_by_key = {
    endpoint: "/v1/organizations/usage_report/messages",
    params: {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      group_by: ["model", "api_key_id"],
    },
    fetched_at: ts(),
    ...(bkResult.status === "fulfilled"
      ? { results: bk }
      : { error: bkResult.reason?.message }),
  };

  const bw: UsageBucket[] =
    bwResult.status === "fulfilled" ? bwResult.value : [];
  raw.usage_by_workspace = {
    endpoint: "/v1/organizations/usage_report/messages",
    params: {
      starting_at: s,
      ending_at: e,
      bucket_width: "1d",
      group_by: ["workspace_id", "model"],
    },
    fetched_at: ts(),
    ...(bwResult.status === "fulfilled"
      ? { results: bw }
      : { error: bwResult.reason?.message }),
  };

  // Check for rate limit errors and throw immediately
  for (const result of [bmResult, bkResult, bwResult]) {
    if (
      result.status === "rejected" &&
      result.reason?.message?.startsWith("RATE_LIMIT:")
    ) {
      throw result.reason;
    }
  }

  log("Analyzing...");
  return { org, ws, bm, bk, bw, rawBk: bk, rawBm: bm, raw };
}
