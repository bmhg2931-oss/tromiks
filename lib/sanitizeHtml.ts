// סניטציה בסיסית ל-HTML מעוצב (מקור מתוך עורך העשיר בהגדרות המיתוג, אדמין בלבד) -
// מסירה תגי סקריפט/סטייל ותכונות "on*" לפני שמירה, כדי שהתוכן יוכל להישמר ולהיות
// מוזרק ישירות (ללא escape) לתוך מסמכים/מיילים מבלי לפתוח דלת ל-XSS
export function sanitizeRichHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}
