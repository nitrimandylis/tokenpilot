import {
  generateAnthropicOrg,
  generateAnthropicWorkspaces,
  generateAnthropicUsageData,
  generateOpenAIProjects,
  generateOpenAIUsageData,
  generateOpenAICosts,
} from "./data.ts";

const PORT = 3456;

function parseDateRange(url: URL): { year: number; month: number } {
  const startDate =
    url.searchParams.get("start_date") || url.searchParams.get("start");
  const endDate =
    url.searchParams.get("end_date") || url.searchParams.get("end");

  let year = new Date().getFullYear();
  let month = new Date().getMonth();

  if (startDate) {
    const d = new Date(startDate);
    year = d.getFullYear();
    month = d.getMonth();
  }

  return { year, month };
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
    return new Response(
      JSON.stringify({ workspaces: generateAnthropicWorkspaces() }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (
    segments[0] === "v1" &&
    segments[1] === "organizations" &&
    segments[2] === "usage_report" &&
    segments[3] === "messages"
  ) {
    const { year, month } = parseDateRange(url);
    const usage = generateAnthropicUsageData(year, month);
    return new Response(JSON.stringify({ usage }), {
      headers: { "Content-Type": "application/json" },
    });
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
    const usage = generateOpenAIUsageData(year, month);

    return new Response(JSON.stringify({ data: usage, has_more: false }), {
      headers: { "Content-Type": "application/json" },
    });
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

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace("/api/", "").replace("/v1/", "");
    const method = req.method;

    console.log(`${method} ${url.pathname}`);

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

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`Mock API server running at http://localhost:${PORT}`);
console.log(
  `Anthropic endpoints: http://localhost:${PORT}/api/anthropic/v1/organizations/me`
);
console.log(
  `OpenAI endpoints: http://localhost:${PORT}/api/openai/v1/organization/projects`
);
console.log(`\nTo test with date range:`);
console.log(
  `http://localhost:${PORT}/api/anthropic/v1/organizations/usage_report/messages?start_date=2026-01-01&end_date=2026-12-31`
);
console.log(
  `http://localhost:${PORT}/api/openai/v1/organization/usage?start=2026-01-01&end=2026-12-31`
);
