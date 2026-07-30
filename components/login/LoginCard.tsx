"use client";

import { useEffect } from "react";
import { motion, useAnimationControls, useReducedMotion, type Variants } from "motion/react";

export default function LoginCard({
  children,
  shakeTrigger,
}: {
  children: React.ReactNode;
  shakeTrigger: number;
}) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 26 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0.3 : 0.7,
        ease: [0.22, 1, 0.36, 1],
        staggerChildren: reduceMotion ? 0 : 0.08,
        delayChildren: reduceMotion ? 0 : 0.2,
      },
    },
  };

  useEffect(() => {
    controls.start("show");
  }, [controls]);

  useEffect(() => {
    if (shakeTrigger === 0 || reduceMotion) return;
    controls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4, ease: "easeInOut" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeTrigger]);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate={controls}
      className="relative z-20 w-full max-w-sm rounded-2xl border border-line/60 bg-white p-8 shadow-xl"
    >
      {children}
    </motion.div>
  );
}
