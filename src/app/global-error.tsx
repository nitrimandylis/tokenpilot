"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 font-sans">
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-2xl w-full text-center">
            {/* Critical Error Graphic */}
            <div className="mb-8 relative">
              <div className="text-[180px] font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-900 leading-none select-none">
                500
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-400/20 to-red-600/20 animate-pulse" />
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <svg
                  className="w-20 h-20 text-red-500/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
              </div>
            </div>

            {/* Content */}
            <h1 className="text-3xl font-extrabold tracking-tight mb-3">
              Critical Error
            </h1>
            <p className="text-slate-400 text-base mb-8 max-w-md mx-auto">
              A critical error occurred. This might be due to a temporary issue.
              Please try refreshing the page or contact support if the problem
              persists.
            </p>

            {/* Error Details (for development) */}
            {process.env.NODE_ENV === "development" && error.message && (
              <div className="mt-6 mx-auto max-w-lg rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-left mb-8">
                <p className="text-xs font-semibold mb-1 text-red-400">
                  Error Details (dev only)
                </p>
                <p className="text-xs text-slate-400 font-mono break-all">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-slate-600 font-mono mt-2">
                    Digest: {error.digest}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center mb-12">
              <button
                onClick={reset}
                className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
              >
                Try Again
              </button>
              <Link
                href="/"
                className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-medium text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
              >
                ← Back to Home
              </Link>
            </div>

            {/* Brand */}
            <div className="mt-12 flex items-center justify-center gap-2 text-slate-700">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                <span className="text-[8px] font-black text-slate-950">TP</span>
              </div>
              <span className="text-xs font-mono">TokenPilot</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
