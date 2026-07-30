import { createClient } from "@/lib/supabase/server";
import NameListManager from "@/components/NameListManager";
import BulkImportModal from "@/components/BulkImportModal";
import ExportButton from "@/components/ExportButton";
import {
  addDonationHandler,
  deleteDonationHandler,
  setDonationHandlerActive,
  reorderDonationHandlers,
  bulkImportHandlersFromRows,
} from "../actions";
import { exportHandlersRows } from "../export-actions";

export default async function DonationHandlersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("donation_handlers")
    .select("id, name, active")
    .is("deleted_at", null)
    .order("sort_order");

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg font-bold">מטפלים</h2>
        <div className="flex items-center gap-2">
          <ExportButton buttonLabel="ייצוא לאקסל" filename="מטפלים" sheetName="מטפלים" onExport={exportHandlersRows} />
          <BulkImportModal
            buttonLabel="ייבוא מקובץ"
            title="ייבוא מטפלים"
            instructions='קובץ Excel/CSV עם עמודה אחת (שם המטפל), שורה לכל מטפל. שמות זהים לקיימים ידולגו.'
            columnCount={1}
            onImport={bulkImportHandlersFromRows}
          />
        </div>
      </div>
      <p className="text-sm text-ink-soft mb-4">
        ניהול רשימת המטפלים המוצעת בשדה &quot;מטפל&quot; בטיפול בהתחייבות. ניתן לגרור לשינוי סדר, ולהשבית מטפל
        כדי שלא יוצע ברשומות חדשות. מחיקת מטפל לא משפיעה על רשומות קיימות.
      </p>
      <NameListManager
        items={data ?? []}
        onAdd={addDonationHandler}
        onDelete={deleteDonationHandler}
        onToggleActive={setDonationHandlerActive}
        onReorder={reorderDonationHandlers}
        placeholder="שם מטפל חדש..."
      />
    </div>
  );
}
