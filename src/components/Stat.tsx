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
      <dt className="text-xs font-sans text-bone-subtle">{label}</dt>
      <dd
        className={`mt-1 text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
          g ? "text-moss-light" : y ? "text-warning" : "text-bone"
        }`}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-xs text-bone-subtle">{sub}</dd>}
    </div>
  );
}

export default Stat;
