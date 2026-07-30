"use server";

type GeocodeResult = { ok: boolean; postalCode?: string; error?: string };

// השלמת מיקוד אוטומטית לפי כתובת דרך Google Maps Geocoding API - שירות חיצוני
// בתשלום (יש שכבה חינמית חודשית), דורש מפתח API בהגדרות הפרויקט ב-Google Cloud
// Console עם חיוב פעיל. ר' .env.local.example להוראות התקנה.
export async function lookupPostalCode(street: string, houseNumber: string, city: string, country: string): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { ok: false, error: "לא הוגדר GOOGLE_MAPS_API_KEY בקובץ .env.local" };

  const addressParts = [`${street} ${houseNumber}`.trim(), city, country || "ישראל"].filter(Boolean);
  const address = addressParts.join(", ");
  if (!address) return { ok: false, error: "יש למלא רחוב ועיר לפני השלמת מיקוד" };

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      return { ok: false, error: "לא נמצאה כתובת תואמת - יש לבדוק את פרטי הכתובת" };
    }
    const components = data.results[0].address_components as { long_name: string; types: string[] }[];
    const postal = components.find((c) => c.types.includes("postal_code"));
    if (!postal) return { ok: false, error: "לא נמצא מיקוד עבור הכתובת הזו" };
    return { ok: true, postalCode: postal.long_name };
  } catch {
    return { ok: false, error: "שגיאה בפנייה לשירות המיקוד" };
  }
}
