"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAndStageNedarimHistoryPage, getNedarimSyncStatus } from "@/app/(app)/donations/nedarim-sync-actions";

type Totals = { fetched: number; staged: number; skippedDuplicates: number };

// נדרים פלוס חוסם אחרי 20 קריאות בשעה (ר' lib/nedarim.ts) - נשארים מתחת לזה
// בכוונה (לא 20 בדיוק) כדי להשאיר מרווח לקריאות אחרות שכבר בוצעו באותה שעה
// (למשל לחיצה קודמת על הכפתור, או ה-cron היומי)
const MAX_CALLS_PER_RUN = 15;

function isRateLimitError(message: string | null | undefined): boolean {
  return Boolean(message && /מכסת 20 בקשות|too many requests/i.test(message));
}

// לולאת ייבוא בצד לקוח: כל קריאה ל-fetchAndStageNedarimHistoryPage היא עצמאית
// וחסומה בזמן (ר' מגבלת Vercel Hobby - 10 שניות ל-invocation), אז אי אפשר לתכנן
// בקשה אחת ענקית שסורקת את כל ההיסטוריה - הלולאה כאן קוראת שוב ושוב, מעדכנת
// התקדמות, ועוצרת ב-reachedEnd/pastCutoff או כשהמשתמש לוחץ "עצור" (בטוח לעצור
// בכל רגע - הסמן כבר נשמר ב-DB אחרי כל קריאה בודדת)
export default function NedarimSyncPanel({ onImported }: { onImported: () => void }) {
  const [lastId, setLastId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [untilDate, setUntilDate] = useState("");
  const [running, setRunning] = useState(false);
  // ref ולא state: הלולאה הרצה ב-runImport היא סגירה (closure) אסינכרונית אחת
  // ארוכה - עדכון state רגיל (setStopRequested) לא היה נראה בתוך הלולאה כי היא
  // כבר לכדה את הערך הישן; ref נקרא מחדש בכל איטרציה ומשקף שינוי מיידי
  const stopRef = useRef(false);
  const [totals, setTotals] = useState<Totals>({ fetched: 0, staged: 0, skippedDuplicates: 0 });
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);

  async function loadStatus() {
    const status = await getNedarimSyncStatus();
    setLastId(status.lastId);
    setUpdatedAt(status.updatedAt);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function runImport() {
    setRunning(true);
    stopRef.current = false;
    setError(null);
    setPaused(false);
    setDone(false);
    setTotals({ fetched: 0, staged: 0, skippedDuplicates: 0 });

    let anyStaged = false;
    let calls = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      calls++;
      const result = await fetchAndStageNedarimHistoryPage({ untilDate: untilDate || undefined });
      if (!result.ok) {
        if (isRateLimitError(result.error)) {
          // לא שגיאה אמיתית - הסמן כבר נשמר מהקריאות הקודמות, אפשר פשוט להמשיך
          // מאוחר יותר. מוצג כהודעת מידע נייטרלית, לא כשגיאה אדומה
          setPaused(true);
        } else {
          setError(result.error ?? "שגיאה בסנכרון מנדרים פלוס");
        }
        break;
      }
      setTotals((prev) => ({
        fetched: prev.fetched + result.fetched,
        staged: prev.staged + result.staged,
        skippedDuplicates: prev.skippedDuplicates + result.skippedDuplicates,
      }));
      if (result.staged > 0) anyStaged = true;
      setLastId(result.lastId);

      if (result.reachedEnd || result.pastCutoff) break;
      if (stopRef.current) break;
      if (calls >= MAX_CALLS_PER_RUN) {
        // עוצרים ביוזמתנו לפני שמגיעים בפועל למגבלת נדרים פלוס (20/שעה) - עדיף
        // עצירה מסודרת עם המשך ברור מאשר לחכות לתשובת שגיאה מהשרת שלהם
        setPaused(true);
        break;
      }
    }

    setRunning(false);
    setDone(true);
    await loadStatus();
    if (anyStaged) onImported();
  }

  return (
    <div className="border border-line rounded-xl p-4 mb-4 bg-parchment/40">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="text-sm text-ink-soft">
          {lastId ? `סונכרן עד מזהה עסקה ${lastId}` : "טרם בוצע סנכרון"}
          {updatedAt && ` · עודכן לאחרונה ${new Date(updatedAt).toLocaleString("he-IL")}`}
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-ink-soft mb-0.5">יבא עד תאריך (השאר ריק לכל ההיסטוריה הזמינה)</label>
          <input type="date" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} disabled={running} className="in text-sm" />
        </div>
        {!running ? (
          <button
            type="button"
            onClick={runImport}
            className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 h-9 text-sm transition"
          >
            {lastId ? "המשך ייבוא היסטוריה" : "התחל ייבוא היסטוריה"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="border border-line rounded-full px-4 h-9 text-sm bg-white hover:bg-parchment transition"
          >
            עצור (אפשר להמשיך מאוחר יותר)
          </button>
        )}
      </div>

      {(running || done) && (
        <p className="text-xs text-ink-soft mt-2">
          {running ? "מייבא..." : "הסתיים."} נבדקו {totals.fetched}, נשמרו {totals.staged}, כבר קיימות (דולגו) {totals.skippedDuplicates}.
        </p>
      )}
      {paused && (
        <p className="text-xs text-brass-deep mt-2">
          הגעה למגבלת הבקשות השעתית של נדרים פלוס (20 לשעה) - ההתקדמות נשמרה, אפשר ללחוץ &quot;המשך ייבוא היסטוריה&quot; שוב בעוד כשעה.
        </p>
      )}
      {error && <p className="text-xs text-wine mt-2">{error}</p>}
    </div>
  );
}
