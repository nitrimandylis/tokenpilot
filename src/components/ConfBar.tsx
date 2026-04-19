"use client";

interface ConfBarProps {
  value: number;
}

function ConfBar({ value }: ConfBarProps) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[3px] bg-ink-border rounded-full overflow-hidden">
        <div
          className="h-full bg-moss rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-bone-subtle w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

export default ConfBar;
