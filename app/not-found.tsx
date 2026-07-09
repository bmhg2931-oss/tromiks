"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import AnimatedBackground from "@/components/login/AnimatedBackground";

export default function NotFound() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/40 bg-white/70 p-10 text-center shadow-xl backdrop-blur-xl"
      >
        <Image src="/logo.png" alt="תרומיקס" width={48} height={48} className="h-12 w-12 object-contain mx-auto mb-5" priority />

        <motion.div
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-7xl font-bold text-brass mb-1 leading-none"
        >
          404
        </motion.div>

        <h1 className="font-serif text-xl font-bold text-ink mb-2">העמוד הזה לא נמצא</h1>
        <p className="text-sm text-ink-soft leading-relaxed mb-7">
          נראה שהעמוד שחיפשת עוד לא &quot;נרשם&quot; אצלנו במערכת - אולי הכתובת שגויה, או שהעמוד הוסר.
        </p>

        <Link
          href="/contacts"
          className="inline-flex items-center justify-center gap-2 bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-6 py-2.5 text-sm transition shadow-sm hover:shadow-md"
        >
          חזרה לעמוד הראשי
        </Link>
      </motion.div>
    </div>
  );
}
