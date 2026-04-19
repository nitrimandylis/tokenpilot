"use client";

import type { Severity } from "@/types";

interface PillProps {
  s: Severity;
}

function Pill({ s }: PillProps) {
  const c: Record<Severity, string> = {
    critical: "bg-critical text-bone",
    warning: "bg-warning text-ink",
    info: "bg-info text-bone",
    ok: "bg-moss text-bone",
  };
  const t: Record<Severity, string> = {
    critical: "Critical",
    warning: "Warning",
    info: "Info",
    ok: "Ok",
  };
  return (
    <span
      className={`inline-flex rounded-[2px] px-1.5 py-0.5 text-[10px] font-medium ${c[s] || c.info}`}
    >
      {t[s] || s}
    </span>
  );
}

export default Pill;
