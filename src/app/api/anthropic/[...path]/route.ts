import { NextRequest, NextResponse } from "next/server";

const MOCK_API_URL = process.env.MOCK_API_URL;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 401 }
      );
    }

    const { path: pathSegments } = await params;
    const path = pathSegments.join("/");

    const baseUrl = MOCK_API_URL || "https://api.anthropic.com";
    const url = new URL(`${baseUrl}/${path}`);

    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
    };

    if (!MOCK_API_URL) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
    });

    const data = await response.json();

    const rateLimitHeaders: Record<string, string> = {};
    const retryAfter = response.headers.get("retry-after");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");

    if (retryAfter) {
      rateLimitHeaders["retry-after"] = retryAfter;
    }
    if (rateLimitReset) {
      rateLimitHeaders["x-ratelimit-reset"] = rateLimitReset;
    }

    return NextResponse.json(data, {
      status: response.status,
      headers: rateLimitHeaders,
    });
  } catch (error) {
    console.error("Anthropic API proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request to Anthropic API" },
      { status: 500 }
    );
  }
}
