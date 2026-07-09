"use client";

import { motion, useReducedMotion } from "motion/react";

export default function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const disableMotion = reduceMotion || loading;

  return (
    <motion.button
      type="submit"
      disabled={loading}
      whileHover={disableMotion ? undefined : { scale: 1.02 }}
      whileTap={disableMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="w-full flex items-center justify-center gap-2 bg-brass hover:bg-brass-deep text-white font-semibold rounded-full py-2.5 text-sm transition-colors shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading && (
        <motion.span
          aria-hidden
          className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
        />
      )}
      {children}
    </motion.button>
  );
}
