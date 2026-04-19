import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ink text-bone font-sans flex items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center">
        {/* Animated 404 Graphic */}
        <div className="mb-8 relative">
          <div className="text-[180px] font-black text-transparent bg-clip-text bg-gradient-to-br from-ink-elevated to-ink leading-none select-none font-display">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-moss-light/20 to-moss/20 animate-pulse" />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg
              className="w-20 h-20 text-moss/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <h1 className="text-3xl font-extrabold tracking-tight mb-3 font-display">
          Page Not Found
        </h1>
        <p className="text-bone-muted text-base mb-8 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist. It might have
          been moved or deleted, or the URL might be incorrect.
        </p>

        {/* Action Buttons */}
        <div className="flex justify-center mb-12">
          <Link
            href="/"
            className="rounded-lg bg-moss px-6 py-3 text-sm font-bold text-bone hover:bg-moss-light transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        {/* Helpful Links */}
        <div className="border-t border-ink-border pt-8">
          <p className="text-xs text-bone-subtle mb-4 font-semibold">
            Quick Links
          </p>
          <div className="flex gap-6 justify-center text-sm">
            <Link
              href="/"
              className="text-bone-subtle hover:text-moss-light transition-colors"
            >
              Get New Report
            </Link>
            <span className="text-ink-border">·</span>
            <Link
              href="/history"
              className="text-bone-subtle hover:text-moss-light transition-colors"
            >
              Analysis History
            </Link>
            <span className="text-ink-border">·</span>
            <a
              href="https://docs.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bone-subtle hover:text-moss-light transition-colors"
            >
              Anthropic Docs
            </a>
          </div>
        </div>

        {/* Brand */}
        <div className="mt-12 flex items-center justify-center gap-2 text-bone-subtle/50">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-moss-light to-moss flex items-center justify-center">
            <span className="text-[8px] font-black text-bone">TP</span>
          </div>
          <span className="text-xs font-mono">TokenPilot</span>
        </div>
      </div>
    </div>
  );
}
