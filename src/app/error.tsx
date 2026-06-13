"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center">
        {/* Animated Error Graphic */}
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
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <h1 className="text-3xl font-extrabold tracking-tight mb-3">
          Something Went Wrong
        </h1>
        <p className="text-slate-400 text-base mb-2 max-w-md mx-auto">
          An unexpected error occurred while processing your request. This has
          been logged and we&apos;ll look into it.
        </p>

        {/* Error Details (for development) */}
        {process.env.NODE_ENV === "development" && error.message && (
          <div className="mt-6 mx-auto max-w-lg rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-left">
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
        <div className="flex justify-center mt-8 mb-12">
          <Link
            href="/"
            className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-medium text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Helpful Tips */}
        <div className="border-t border-slate-800 pt-8">
          <p className="text-xs text-slate-600 mb-4 uppercase tracking-wider font-semibold">
            What You Can Do
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">
                Refresh the Page
              </h3>
              <p className="text-xs text-slate-500">
                Sometimes a simple refresh can resolve the issue
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">
                Check Your Connection
              </h3>
              <p className="text-xs text-slate-500">
                Make sure you&apos;re connected to the internet
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <svg
                  className="w-5 h-5 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-slate-300 mb-1">
                Start Fresh
              </h3>
              <p className="text-xs text-slate-500">
                Go to the home page and run a new analysis
              </p>
            </div>
          </div>
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
  );
}
