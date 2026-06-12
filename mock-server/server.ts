import {
  generateAnthropicOrg,
  generateAnthropicWorkspaces,
  generateAnthropicUsageData,
  generateOpenAIProjects,
  generateOpenAIUsageData,
  generateOpenAICosts,
  generateOpenAIOrg,
  generateBusinessProfile,
  setActiveProfile,
  getActiveProfile,
} from "./data.ts";

const PORT = 3456;

// Requests within one analysis arrive in a rapid burst; an idle gap means
// the user clicked Analyze again — simulate a different business each time.
const PROFILE_IDLE_MS = 15_000;
let lastRequestAt = 0;

function rotateProfileIfIdle(): void {
  const now = Date.now();
  if (now - lastRequestAt > PROFILE_IDLE_MS) {
    setActiveProfile(generateBusinessProfile());
    const p = getActiveProfile();
    console.log(
      `New business profile: ${p.orgName} (scale ${p.scale.toFixed(2)}x, cache ${p.cacheAffinity.toFixed(2)}, weekend ${p.weekendFactor.toFixed(2)}, volatility ${p.volatility.toFixed(2)})`
    );
  }
  lastRequestAt = now;
}

function parseDateRange(url: URL): { year: number; month: number } {
  const startDate =
    url.searchParams.get("start_date") ||
    url.searchParams.get("start") ||
    url.searchParams.get("start_time");
  const endDate =
    url.searchParams.get("end_date") ||
    url.searchParams.get("end") ||
    url.searchParams.get("end_time");

  let year = new Date().getFullYear();
  let month = new Date().getMonth();

  if (startDate) {
    let d: Date;
    // Check if it's a Unix timestamp (numeric string)
    if (/^\d+$/.test(startDate)) {
      // Unix timestamp in seconds
      d = new Date(parseInt(startDate) * 1000);
    } else {
      d = new Date(startDate);
    }
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth();
    }
  }

  return { year, month };
}

function parseGroupBy(url: URL): string[] {
  const groupBy = url.searchParams.get("group_by");
  if (!groupBy) return [];
  return groupBy.split(",");
}

function parseLimitPage(url: URL): { limit: number; page: number } {
  const limit = parseInt(url.searchParams.get("limit") || "1000", 10);
  const page = parseInt(url.searchParams.get("page") || "0", 10);
  return { limit: Math.min(limit, 5000), page: Math.max(0, page) };
}

function handleAnthropic(path: string, method: string, url: URL): Response {
  if (method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const segments = path.split("/").filter(Boolean);

  if (
    segments[0] === "v1" &&
    segments[1] === "organizations" &&
    segments[2] === "me"
  ) {
    return new Response(JSON.stringify(generateAnthropicOrg()), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "organizations" &&
    segments[2] === "workspaces"
  ) {
    const workspaces = generateAnthropicWorkspaces();
    return new Response(JSON.stringify({ data: workspaces, has_more: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "organizations" &&
    segments[2] === "usage_report" &&
    segments[3] === "messages"
  ) {
    const { year, month } = parseDateRange(url);
    const group_by = parseGroupBy(url);
    const { limit, page } = parseLimitPage(url);

    const usage = generateAnthropicUsageData(year, month, {
      group_by,
      limit,
      page,
    });

    return new Response(
      JSON.stringify({
        data: usage.data,
        has_more: usage.has_more,
        next_page: usage.next_page,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

function handleOpenAI(path: string, method: string, url: URL): Response {
  if (method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const segments = path.split("/").filter(Boolean);

  if (
    segments[0] === "v1" &&
    segments[1] === "organization" &&
    segments[2] === "projects"
  ) {
    return new Response(
      JSON.stringify({ data: generateOpenAIProjects(), has_more: false }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "organization" &&
    segments[2] === "usage"
  ) {
    const { year, month } = parseDateRange(url);
    const endpoint = segments[3] || undefined;
    const group_by = parseGroupBy(url);
    const { limit, page } = parseLimitPage(url);

    const usage = generateOpenAIUsageData(year, month, {
      endpoint,
      group_by,
      limit,
      page,
    });

    return new Response(
      JSON.stringify({
        data: usage.data,
        has_more: usage.has_more,
        next_page: usage.next_page,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "organization" &&
    segments[2] === "costs"
  ) {
    const { year, month } = parseDateRange(url);
    const costs = generateOpenAICosts(year, month);

    return new Response(JSON.stringify(costs), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (segments[0] === "v1" && segments[1] === "organization") {
    const org = generateOpenAIOrg();
    return new Response(JSON.stringify(org), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    rotateProfileIfIdle();
    console.log(`${method} ${url.pathname}`);

    // Handle direct mock server calls (/api/anthropic/... or /api/openai/...)
    if (url.pathname.startsWith("/api/anthropic")) {
      const anthPath = url.pathname
        .replace("/api/anthropic/", "")
        .replace("/api/anthropic", "");
      return handleAnthropic(anthPath, method, url);
    }

    if (url.pathname.startsWith("/api/openai")) {
      const openaiPath = url.pathname
        .replace("/api/openai/", "")
        .replace("/api/openai", "");
      return handleOpenAI(openaiPath, method, url);
    }

    // Handle paths forwarded from Next.js (without /api/ prefix)
    // Check plural forms first to avoid prefix matching issues
    if (url.pathname.startsWith("/v1/organizations")) {
      const anthPath = url.pathname.slice(1);
      return handleAnthropic(anthPath, method, url);
    }

    if (
      url.pathname.startsWith("/v1/organization") &&
      !url.pathname.startsWith("/v1/organizations")
    ) {
      const openaiPath = url.pathname.slice(1);
      return handleOpenAI(openaiPath, method, url);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`Mock API server running at http://localhost:${PORT}`);
console.log(`Anthropic endpoints:`);
console.log(`  http://localhost:${PORT}/api/anthropic/v1/organizations/me`);
console.log(
  `  http://localhost:${PORT}/api/anthropic/v1/organizations/workspaces`
);
console.log(
  `  http://localhost:${PORT}/api/anthropic/v1/organizations/usage_report/messages`
);
console.log(`\nOpenAI endpoints:`);
console.log(`  http://localhost:${PORT}/api/openai/v1/organization/projects`);
console.log(
  `  http://localhost:${PORT}/api/openai/v1/organization/usage/completions`
);
console.log(
  `  http://localhost:${PORT}/api/openai/v1/organization/usage/embeddings`
);
console.log(`  http://localhost:${PORT}/api/openai/v1/organization/costs`);
console.log(`\nWith date range and pagination:`);
console.log(
  `http://localhost:${PORT}/api/anthropic/v1/organizations/usage_report/messages?start_date=2026-01-01&end_date=2026-12-31&limit=100&page=0`
);
console.log(
  `http://localhost:${PORT}/api/openai/v1/organization/usage/completions?start_time=1735689600&end_time=1738368000&limit=100&page=0`
);
