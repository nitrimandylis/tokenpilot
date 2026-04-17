"use client";

import type { Severity } from "@/types";

interface PillProps {
  s: Severity;
}

function Pill({ s }: PillProps) {
  const c: Record<Severity, string> = {
    critical: "bg-red-500/10 text-red-400 ring-red-500/20",
    warning: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
    info: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
    ok: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  };
  const t: Record<Severity, string> = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    ok: "OK",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${c[s] || c.info}`}
    >
      {t[s] || s}
    </span>
  );
}

export default Pill;
