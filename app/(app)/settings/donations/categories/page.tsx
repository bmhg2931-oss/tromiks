import { createClient } from "@/lib/supabase/server";
import NameListManager from "@/components/NameListManager";
import BulkImportModal from "@/components/BulkImportModal";
import ExportButton from "@/components/ExportButton";
import {
  addDonationCategory,
  deleteDonationCategory,
  setDonationCategoryActive,
  reorderDonationCategories,
  bulkImportCategoriesFromRows,
} from "../actions";
import { exportCategoriesRows } from "../export-actions";

export default async function DonationCategoriesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("donation_categories")
    .select("id, name, active")
    .is("deleted_at", null)
    .order("sort_order");

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg font-bold">קטגוריות תרומה</h2>
        <div className="flex items-center gap-2">
          <ExportButton buttonLabel="ייצוא לאקסל" filename="קטגוריות" sheetName="קטגוריות" onExport={exportCategoriesRows} />
          <BulkImportModal
            buttonLabel="ייבוא מקובץ"
            title="ייבוא קטגוריות"
            instructions='קובץ Excel/CSV עם עמודה אחת (שם הקטגוריה), שורה לכל קטגוריה. שמות זהים לקיימים ידולגו.'
            columnCount={1}
            onImport={bulkImportCategoriesFromRows}
          />
        </div>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        ניהול רשימת הקטגוריות המוצעות בעת רישום תרומה/התחייבות. ניתן לגרור לשינוי סדר, ולהשבית קטגוריה כדי שלא
        תוצע ברשומות חדשות (מבלי להשפיע על רשומות קיימות). מחיקת קטגוריה גם היא לא משפיעה על רשומות קיימות.
      </p>
      <NameListManager
        items={data ?? []}
        onAdd={addDonationCategory}
        onDelete={deleteDonationCategory}
        onToggleActive={setDonationCategoryActive}
        onReorder={reorderDonationCategories}
        placeholder="שם קטגוריה חדשה..."
      />
    </div>
  );
}
