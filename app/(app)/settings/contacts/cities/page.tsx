import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { sortCityEntries } from "@/lib/cityOrder";
import CityListManager from "@/components/CityListManager";
import BulkImportModal from "@/components/BulkImportModal";
import ExportButton from "@/components/ExportButton";
import { bulkImportCitiesFromRows, exportCitiesRows } from "../cities-actions";

export default async function ContactCitiesSettingsPage() {
  const supabase = await createClient();
  const [{ data: cities }, { data: contactCityRows }] = await Promise.all([
    supabase.from("contact_cities").select("id, city, country").is("deleted_at", null),
    fetchAllRows<{ city: string | null }>(() => supabase.from("contacts").select("city").is("deleted_at", null)),
  ]);

  const countsByCity = new Map<string, number>();
  for (const row of contactCityRows) {
    if (!row.city) continue;
    countsByCity.set(row.city, (countsByCity.get(row.city) ?? 0) + 1);
  }

  const sorted = sortCityEntries(cities ?? []);
  const items = sorted.map((c) => ({ ...c, contactCount: countsByCity.get(c.city) ?? 0 }));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg font-bold">ערים</h2>
        <div className="flex items-center gap-2">
          <ExportButton
            buttonLabel="ייצוא לאקסל"
            filename="ערים"
            sheetName="ערים"
            onExport={exportCitiesRows}
          />
          <BulkImportModal
            buttonLabel="ייבוא מקובץ"
            title="ייבוא ערים"
            instructions='קובץ Excel/CSV עם שתי עמודות (עיר, ארץ), שורה לכל עיר. שמות עיר זהים לקיימים ידולגו.'
            columnCount={2}
            onImport={bulkImportCitiesFromRows}
          />
        </div>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        רשימת הערים המוצגות בשדה &quot;עיר&quot; בטופס איש קשר. בחירת עיר מהרשימה משלימה אוטומטית את שדה הארץ. הוסיפו
        כאן ערים חדשות שאינן ברשימה.
      </p>
      <CityListManager items={items} />
    </div>
  );
}
