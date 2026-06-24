import { NextResponse } from "next/server";

// Proxies chat-completion requests to NVIDIA NIM (OpenAI-compatible). The key is
// a server-side deployment env var (NIM_API_KEY) — never sent from the browser.
const NIM_URL =
  process.env.NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
// Independent of MOCK_API_URL: mocking vendor usage data must NOT also mock the
// LLM. Set NIM_MOCK=1 only to exercise the analysis flow without a real nvapi key.
const NIM_MOCK =
  process.env.NIM_MOCK === "1" || process.env.NIM_MOCK === "true";

// True when the LLM-analysis feature is usable: a key is configured (or mock).
const nimEnabled = () => NIM_MOCK || !!process.env.NIM_API_KEY;

// Lets the UI show the "AI analysis" toggle only when NIM is actually configured.
export async function GET() {
  return NextResponse.json({ enabled: nimEnabled() });
}

// When NIM_MOCK is set, synthesize findings from the rows in the request instead
// of calling NVIDIA — so the LLM path is testable offline.
function mockCompletion(body: string) {
  let rows: Array<{ id: string; monthlyCostUsd: number; model: string }> = [];
  let workspaceCount = 0;
  try {
    const parsed = JSON.parse(body);
    const user = parsed.messages?.find(
      (m: { role: string }) => m.role === "user"
    );
    const payload = JSON.parse(user.content);
    rows = payload.rows || [];
    workspaceCount = payload.orgContext?.workspaceCount ?? 0;
  } catch {
    /* fall through with empty rows */
  }

  const findings: unknown[] = [];
  const top = [...rows]
    .sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd)
    .slice(0, 2);
  for (const r of top) {
    const sav = +(r.monthlyCostUsd * 0.4).toFixed(2);
    findings.push({
      rowId: r.id,
      category: "Model Downgrade → smaller model",
      severity:
        r.monthlyCostUsd > 100
          ? "critical"
          : r.monthlyCostUsd > 10
            ? "warning"
            : "info",
      confidence: 0.7,
      savingsMonthly: sav,
      reason: `[MOCK] ${r.model} costs $${r.monthlyCostUsd}/mo; a smaller model likely handles this workload.`,
      action: "Mock finding — set a real NIM key and unset MOCK_API_URL.",
    });
  }
  if (rows.length > 0 && workspaceCount <= 1) {
    findings.push({
      rowId: "org",
      category: "Workspace Organization",
      severity: "info",
      confidence: 0.9,
      savingsMonthly: 0,
      reason: "[MOCK] All spend sits in one workspace/project.",
      action: "Segment by environment/team/product for cost attribution.",
    });
  }

  return {
    choices: [{ message: { content: JSON.stringify({ findings }) } }],
  };
}

export async function POST(request: Request) {
  try {
    let body = await request.text();

    if (NIM_MOCK) {
      return NextResponse.json(mockCompletion(body), { status: 200 });
    }

    const nimKey = process.env.NIM_API_KEY;
    if (!nimKey) {
      return NextResponse.json(
        {
          error:
            "NVIDIA NIM is not configured. Set NIM_API_KEY in the deployment environment.",
        },
        { status: 503 }
      );
    }

    // Optional deployment-side model override (e.g. a faster NIM model).
    if (process.env.NIM_MODEL) {
      try {
        body = JSON.stringify({
          ...JSON.parse(body),
          model: process.env.NIM_MODEL,
        });
      } catch {
        /* leave body as-is if it isn't JSON */
      }
    }

    let response: Response;
    try {
      response = await fetch(`${NIM_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${nimKey}`,
        },
        body,
        // Bound the upstream wait so we don't hang to the 300s stream timeout.
        signal: AbortSignal.timeout(115_000),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "TimeoutError") {
        return NextResponse.json(
          {
            error: "NVIDIA NIM timed out — the model took too long to respond.",
          },
          { status: 504 }
        );
      }
      throw e;
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("NIM proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request to NVIDIA NIM" },
      { status: 500 }
    );
  }
}
