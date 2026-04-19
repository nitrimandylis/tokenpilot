"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";

interface ParallaxProps {
  children: React.ReactNode;
  speed?: number;
}

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export function Parallax({ children, speed = 0.3 }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [speed * -100, speed * 100]);

  if (prefersReducedMotion) {
    return <div ref={ref}>{children}</div>;
  }

  return (
    <div ref={ref}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
