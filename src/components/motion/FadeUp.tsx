import { motion } from "motion/react";

interface FadeUpProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export function FadeUp({ children, delay = 0, duration = 0.5 }: FadeUpProps) {
  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
