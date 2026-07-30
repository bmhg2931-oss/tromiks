"use client";

import { motion, useReducedMotion } from "motion/react";

const FEATURES = [
  { icon: "🗂️", title: "ניהול תרומות והתחייבויות במקום אחד", desc: "כל נדר, תשלום והתחייבות מתועדים ומקושרים אוטומטית." },
  { icon: "💱", title: "מעקב יתרות לפי שער יציג עדכני", desc: "המרות מטבע מדויקות בזמן אמת, בלי חישובים ידניים." },
  { icon: "🔐", title: "הרשאות מותאמות לכל תפקיד", desc: "גזבר, מזכירות, רבנות וגבאים - כל אחד רואה מה שרלוונטי לו." },
  { icon: "⚡", title: "עבודה מהירה וזמינה מכל מקום", desc: "ממשק מודרני שנבנה כדי לחסוך זמן בעבודה היומיומית." },
];

export default function DescriptionPanel() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="hidden lg:flex lg:w-1/2 relative z-10 items-center justify-center p-12 bg-gradient-to-br from-ink to-[#1c2a19] overflow-hidden">
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,_rgba(127,154,94,0.35),_transparent_60%)]" />
      <motion.div
        className="relative max-w-md"
        initial={{ opacity: 0, x: reduceMotion ? 0 : 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      >
        <h1 className="font-serif text-3xl font-bold text-white mb-3">ניהול קהילתי, בלי הכאב ראש</h1>
        <p className="text-sm text-[#c7cabd] leading-relaxed mb-8">
          תרומיקס היא מערכת ניהול תרומות ואנשי קשר שנבנתה במיוחד עבור בתי כנסת וקהילות - כדי שהוועד יתמקד באנשים, לא
          בטבלאות.
        </p>

        <div className="space-y-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="flex items-start gap-3"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 + i * 0.1 }}
            >
              <span className="text-2xl leading-none shrink-0">{f.icon}</span>
              <div>
                <div className="font-semibold text-white text-sm">{f.title}</div>
                <div className="text-xs text-[#a8ac9e] mt-0.5">{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
