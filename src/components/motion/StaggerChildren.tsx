import { motion, type Variants } from "motion/react";

interface StaggerChildrenProps {
  children: React.ReactNode;
  staggerDelay?: number;
  initialDelay?: number;
}

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const containerVariants = (
  staggerDelay: number,
  initialDelay: number
): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: initialDelay,
    },
  },
});

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function StaggerChildren({
  children,
  staggerDelay = 0.07,
  initialDelay = 0,
}: StaggerChildrenProps) {
  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      variants={containerVariants(staggerDelay, initialDelay)}
      initial="hidden"
      animate="visible"
    >
      {Array.isArray(children)
        ? children.map((child, i) => (
            <motion.div key={i} variants={itemVariants}>
              {child}
            </motion.div>
          ))
        : children}
    </motion.div>
  );
}
