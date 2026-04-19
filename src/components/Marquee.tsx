"use client";

import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MarqueeProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export function Marquee({ children, speed = 1, className }: MarqueeProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const animationDuration = `${30 / speed}s`;

  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex w-max animate-marquee" style={{ animationDuration }}>
        <div className="flex">{children}</div>
        <div className="flex" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
