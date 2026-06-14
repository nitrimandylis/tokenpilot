import Link from "next/link";
import { Vendor } from "@/lib/storage";

interface HeaderProps {
  showGuide?: boolean;
  showHistory?: boolean;
  showNewReport?: boolean;
  currentPage?: "home" | "guide" | "history" | "analysis" | "pricing";
  vendor?: Vendor;
}

export default function Header({
  showGuide = true,
  showHistory = true,
  showNewReport = true,
  currentPage,
  vendor,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-ink border-b border-ink-border">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link className="flex items-center gap-2.5" href="/">
          <span
            className="text-lg font-semibold font-display text-bone"
            style={{ letterSpacing: "-0.03em" }}
          >
            TokenPilot
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className={`text-sm font-sans transition-colors ${
              currentPage === "pricing"
                ? "text-bone border-b-2 border-moss pb-0.5"
                : "text-bone-subtle hover:text-bone"
            }`}
          >
            Pricing
          </Link>
          {showGuide && (
            <Link
              href="/guide"
              className={`text-sm font-sans transition-colors ${
                currentPage === "guide"
                  ? "text-bone border-b-2 border-moss pb-0.5"
                  : "text-bone-subtle hover:text-bone"
              }`}
            >
              Guide
            </Link>
          )}
          {showHistory && (
            <Link
              href="/history"
              className={`text-sm font-sans transition-colors ${
                currentPage === "history"
                  ? "text-bone border-b-2 border-moss pb-0.5"
                  : "text-bone-subtle hover:text-bone"
              }`}
            >
              History
            </Link>
          )}
          {showNewReport && (
            <Link
              href={vendor ? `/?vendor=${vendor}` : "/"}
              className="px-4 py-1.5 text-sm font-medium font-sans text-bone bg-moss hover:bg-moss-light rounded-sm transition-colors"
            >
              Get new report →
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
