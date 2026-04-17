/* ═══════════════════ OpenAI API ═══════════════════ */

export interface OpenAIUsageData {
  data: Array<{
    aggregation_timestamp: number;
    n_requests: number;
    operation: string;
    snapshot_id: string;
    n_context_tokens_total: number;
    n_generated_tokens_total: number;
    project_id?: string;
    user_id?: string;
    api_key_id?: string;
    model?: string;
    // Additional fields added during aggregation
    service?: string;
    bucket_start_time?: number;
    // Audio-specific fields
    seconds?: number;
    // Token breakdown fields (various services)
    num_model_requests?: number;
    input_uncached_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    output_text_tokens?: number;
  }>;
}

export interface OpenAICostsData {
  object: string;
  data: Array<{
    start_time: number;
    end_time: number;
    results: Array<{
      object: string;
      amount: {
        value: number; // Cost in USD
        currency: string;
      };
      line_item?: string;
      project_id?: string;
      project_name?: string;
      organization_id?: string;
      organization_name?: string;
    }>;
  }>;
  has_more: boolean;
}

export interface OpenAIPullResult {
  org: any;
  usage: OpenAIUsageData;
  costs: OpenAICostsData | null;
  projects: any[];
  raw: any;
}

/* ═══════════════════ ERROR HANDLING ═══════════════════ */

/**
 * Parse and format OpenAI API errors with user-friendly messages
 */
function handleOpenAIError(status: number, responseText: string): Error {
  const errorMessages: Record<number, string> = {
    401: "Invalid authentication. Please check your OpenAI API key. Common issues: incorrect key, key not authorized for organization access, or account not part of an organization.",
    403: "Access forbidden. Your request may be from an unsupported region, or your IP is not in the allowlist. See: https://platform.openai.com/docs/supported-countries",
    429: "Rate limit exceeded or quota reached. Either you're sending requests too quickly, or you've hit your monthly spending limit. Check your plan and billing: https://platform.openai.com/account/billing",
    500: "OpenAI server error. Please try again in a few moments. If the issue persists, check status: https://status.openai.com",
    503: "Service temporarily unavailable. OpenAI servers are experiencing high traffic or a sudden request spike. Please reduce your request rate and try again in a few minutes.",
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
 * Make an authenticated API call to the OpenAI API via proxy
 * @param key - Admin API key for authentication
 * @param path - API endpoint path
 * @param params - Optional query parameters
 * @returns Parsed JSON response
 * @throws Error with rate limit or standard error message
 */
export async function call(
  key: string,
  path: string,
  params: Record<string, any> = {}
): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.append(k, String(v));
  }

  const r = await fetch(`/api/openai${path}?${qs}`, {
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
    },
  });

  if (!r.ok) {
    const t = await r.text();

    // Handle 429 rate limiting with special format for retry logic
    if (r.status === 429) {
      const retryAfter = r.headers.get("retry-after");
      let waitTime = 60; // Default to 60 seconds

      if (retryAfter) {
        waitTime = parseInt(retryAfter, 10);
      }

      throw new Error(
        `RATE_LIMIT:${waitTime}:Rate limit exceeded or quota reached. Please wait ${Math.ceil(waitTime / 60)} minute(s) before retrying. Check your usage: https://platform.openai.com/usage`
      );
    }

    // Handle all other errors with user-friendly messages
    throw handleOpenAIError(r.status, t);
  }
  return r.json();
}

/**
 * Get date range for a specific month/year (default: current month to date)
 * OpenAI uses Unix timestamps in seconds
 * @param year - Year (e.g., 2026)
 * @param month - Month (0-indexed: 0 = January, 11 = December)
 * @returns Object with start_time and end_time as Unix timestamps in seconds
 */
export function getMonthDateRange(
  year: number,
  month: number
): { start_time: number; end_time: number } {
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Use UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endDate = isCurrentMonth
    ? now
    : new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  return {
    start_time: Math.floor(startDate.getTime() / 1000),
    end_time: Math.floor(endDate.getTime() / 1000),
  };
}

/**
 * Pull all usage data from OpenAI API for a given month
 * Uses OpenAI Admin API endpoints:
 * - /v1/organization/usage/completions for completions usage
 * - /v1/organization/projects for project list
 *
 * @param key - Admin API key
 * @param log - Logging function for progress updates
 * @param year - Year to fetch data for
 * @param month - Month to fetch data for (0-indexed)
 * @returns OpenAIPullResult with organization, usage, projects, and raw API responses
 * @throws Error if authentication fails or rate limit is exceeded
 */
export async function pull(
  key: string,
  log: (msg: string) => void,
  year: number,
  month: number
): Promise<OpenAIPullResult> {
  const { start_time, end_time } = getMonthDateRange(year, month);
  const raw: any = {}; // Store full API responses
  const ts = () => new Date().toISOString();

  log("Authenticating...");

  // OpenAI doesn't provide a /v1/organization endpoint
  // We'll extract org info from other responses
  let org: any = { id: "", name: "Organization" };

  log("Fetching usage data...");

  // Fetch usage from multiple service endpoints
  // Different endpoints support different group_by parameters
  const usageEndpoints = [
    {
      endpoint: "/v1/organization/usage/completions",
      group_by: ["project_id", "model"],
    },
    {
      endpoint: "/v1/organization/usage/audio_speeches",
      group_by: ["project_id", "model"],
    },
    {
      endpoint: "/v1/organization/usage/audio_transcriptions",
      group_by: ["project_id", "model"],
    },
    {
      endpoint: "/v1/organization/usage/images",
      group_by: ["project_id", "model"],
    },
    {
      endpoint: "/v1/organization/usage/moderations",
      group_by: ["project_id", "model"],
    },
    {
      endpoint: "/v1/organization/usage/vector_stores",
      group_by: ["project_id"],
    }, // No model grouping
    {
      endpoint: "/v1/organization/usage/code_interpreter_sessions",
      group_by: ["project_id"],
    }, // No model grouping
  ];

  let allUsageData: any[] = [];

  for (const { endpoint, group_by } of usageEndpoints) {
    try {
      let allPages: any[] = [];
      let nextPage: string | undefined = undefined;
      let pageCount = 0;

      // Fetch all pages
      do {
        const params: any = {
          start_time,
          end_time,
          bucket_width: "1d",
          group_by,
        };

        if (nextPage) {
          params.page = nextPage;
        }

        const r = await call(key, endpoint, params);

        // Store first page response in raw
        if (pageCount === 0) {
          const endpointName = endpoint.split("/").pop()!;
          raw[endpointName] = {
            endpoint,
            params: { start_time, end_time, bucket_width: "1d", group_by },
            fetched_at: ts(),
            response: r,
          };
        }

        // Extract detailed usage from buckets
        if (r.data && Array.isArray(r.data)) {
          for (const bucket of r.data) {
            if (bucket.results && bucket.results.length > 0) {
              allPages.push(
                ...bucket.results.map((result: any) => ({
                  ...result,
                  bucket_start_time: bucket.start_time,
                }))
              );
            }
          }
        }

        // Check for more pages
        nextPage = r.has_more ? r.next_page : undefined;
        pageCount++;

        // Safety limit: max 100 pages
        if (pageCount > 100) {
          console.warn(`[OpenAI API] Hit page limit for ${endpoint}`);
          break;
        }
      } while (nextPage);

      // Add service name to all results
      const endpointName = endpoint.split("/").pop()!;
      allUsageData.push(
        ...allPages.map((result: any) => ({
          ...result,
          service: endpointName,
        }))
      );

      if (pageCount > 1) {
        console.log(
          `[OpenAI API] Fetched ${pageCount} pages for ${endpointName}`
        );
      }
    } catch (e: any) {
      const endpointName = endpoint.split("/").pop()!;
      raw[endpointName] = {
        endpoint,
        fetched_at: ts(),
        error: e.message,
      };
      // Continue with other endpoints even if one fails
    }
  }

  const usage: OpenAIUsageData = { data: allUsageData as any };
  console.log(
    `[OpenAI API] Fetched ${allUsageData.length} total usage records across all services`
  );

  log("Fetching projects...");

  // Fetch projects list
  let projects: any[] = [];
  try {
    const r = await call(key, "/v1/organization/projects", { limit: 100 });
    projects = r.data || [];
    raw.projects = {
      endpoint: "/v1/organization/projects",
      params: { limit: 100 },
      fetched_at: ts(),
      response: r,
    };

    // Try to extract org info from projects response
    if (!org.id && r.organization_id) {
      org.id = r.organization_id;
    }
    if (org.name === "Organization" && r.organization_name) {
      org.name = r.organization_name;
    }
  } catch (x: any) {
    raw.projects = {
      endpoint: "/v1/organization/projects",
      fetched_at: ts(),
      error: x.message,
    };
  }

  log("Fetching costs...");

  // Fetch aggregated costs across all products
  let costs: OpenAICostsData | null = null;
  try {
    const r = await call(key, "/v1/organization/costs", {
      start_time,
      end_time,
      bucket_width: "1d",
      limit: 100,
    });
    costs = r;
    raw.costs = {
      endpoint: "/v1/organization/costs",
      params: { start_time, end_time, bucket_width: "1d", limit: 100 },
      fetched_at: ts(),
      response: r,
    };

    // Extract organization name and ID from costs response
    if (costs && costs.data && costs.data.length > 0) {
      for (const bucket of costs.data) {
        if (bucket.results && bucket.results.length > 0) {
          for (const result of bucket.results) {
            if (result.organization_name) {
              org.name = result.organization_name;
            }
            if (result.organization_id) {
              org.id = result.organization_id;
            }
            if (org.name !== "Organization" && org.id) break;
          }
          if (org.name !== "Organization" && org.id) break;
        }
      }
    }
  } catch (x: any) {
    raw.costs = {
      endpoint: "/v1/organization/costs",
      fetched_at: ts(),
      error: x.message,
    };
    // Non-critical - continue without costs data
    console.warn("Failed to fetch costs data:", x.message);
  }

  log("Analyzing...");
  return { org, usage, costs, projects, raw };
}
