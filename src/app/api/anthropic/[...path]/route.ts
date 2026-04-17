import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Extract API key from headers
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 401 }
      );
    }

    // Await params in Next.js 16
    const { path: pathSegments } = await params;

    // Construct the Anthropic API URL
    const path = pathSegments.join("/");
    const url = new URL(`https://api.anthropic.com/${path}`);

    // Forward query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    // Make request to Anthropic API
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    // Get response data
    const data = await response.json();

    // Extract rate limit headers
    const rateLimitHeaders: Record<string, string> = {};
    const retryAfter = response.headers.get("retry-after");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");

    if (retryAfter) {
      rateLimitHeaders["retry-after"] = retryAfter;
    }
    if (rateLimitReset) {
      rateLimitHeaders["x-ratelimit-reset"] = rateLimitReset;
    }

    // Return response with preserved headers
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
