import Link from "next/link";
import { Vendor } from "@/lib/storage";

interface HeaderProps {
  showGuide?: boolean;
  showHistory?: boolean;
  showNewReport?: boolean;
  currentPage?: "home" | "guide" | "history" | "analysis";
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
    <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800/60">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link className="flex items-center gap-3" href="/">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center cursor-pointer">
            <span className="text-[11px] font-black text-slate-950">TP</span>
          </div>
          <span className="text-base font-bold tracking-tight">TokenPilot</span>
        </Link>
        <div className="flex items-center gap-3">
          {showGuide && (
            <Link
              href="/guide"
              className={`text-xs font-semibold transition-colors ${
                currentPage === "guide"
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Guide
            </Link>
          )}
          {showHistory && (
            <Link
              href="/history"
              className={`text-xs font-semibold transition-colors ${
                currentPage === "history"
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              History
            </Link>
          )}
          {showNewReport && (
            <Link
              href={vendor ? `/?vendor=${vendor}` : "/"}
              className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors"
            >
              Get New Report
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
