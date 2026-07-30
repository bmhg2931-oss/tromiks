"use client";

import { motion, useReducedMotion } from "motion/react";

const BLOBS = [
  { className: "bg-brass/25 w-[26rem] h-[26rem] -top-32 -right-24", duration: 26, range: 40 },
  { className: "bg-sage/15 w-[22rem] h-[22rem] -bottom-24 -left-20", duration: 32, range: 32 },
  { className: "bg-parchment-deep/70 w-[18rem] h-[18rem] top-1/3 left-1/2", duration: 22, range: 26 },
];

export default function AnimatedBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-parchment via-parchment to-parchment-deep"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      {BLOBS.map((blob, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${blob.className}`}
          animate={reduceMotion ? undefined : { x: [0, blob.range, 0], y: [0, -blob.range, 0] }}
          transition={{ duration: blob.duration, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </motion.div>
  );
}
