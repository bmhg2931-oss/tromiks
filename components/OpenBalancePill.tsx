import { formatOpenBalance } from "@/lib/pledgeBalance";

// צבע התגית מתחלף לפי גובה היתרה הפתוחה: ככל שהחוב גדול יותר הצבע חד ומזהיר יותר
function balanceColorClass(balance: number): string {
  if (balance > 10000) return "bg-wine text-white";
  if (balance > 3000) return "bg-wine/15 text-wine";
  if (balance > 1000) return "bg-[#f3e9d2] text-[#8a6415]";
  return "bg-parchment-deep border border-line text-ink-soft";
}

// רוחב קבוע לכל התגיות בעמודה (ללא קשר לאורך הסכום בפועל) כדי שהעמודה תיראה אחידה
const PILL_WIDTH = "w-24";

export default function OpenBalancePill({ balance, currency = "₪" }: { balance: number; currency?: string }) {
  const label = formatOpenBalance(balance, currency);
  if (label === "—") return <span className={`inline-block ${PILL_WIDTH} text-center text-ink-soft`}>—</span>;
  return <span className={`pill inline-block ${PILL_WIDTH} text-center whitespace-nowrap overflow-hidden text-ellipsis ${balanceColorClass(balance)}`}>{label}</span>;
}
