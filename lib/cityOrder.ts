// מיון קבוע לרשימת הערים המנוהלת: קודם ערים בארץ ישראל, ולאחר מכן חו"ל, בכל קבוצה לפי סדר א"ב
export function sortCityEntries<T extends { city: string; country: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aIL = a.country === "ארץ ישראל" ? 0 : 1;
    const bIL = b.country === "ארץ ישראל" ? 0 : 1;
    if (aIL !== bIL) return aIL - bIL;
    return a.city.localeCompare(b.city, "he");
  });
}
