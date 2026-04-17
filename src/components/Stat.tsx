"use client";

interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  g?: boolean;
  y?: boolean;
}

function Stat({ label, value, sub, g, y }: StatProps) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 tracking-wide uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 text-2xl sm:text-3xl font-bold tracking-tight ${g ? "text-emerald-400" : y ? "text-yellow-400" : "text-white"}`}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

export default Stat;
