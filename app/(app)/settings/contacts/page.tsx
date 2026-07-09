import { createClient } from "@/lib/supabase/server";
import { CONTACT_FIELD_DEFS, DEFAULT_VISIBLE_FIELDS, type UserRole } from "@/lib/types";
import { updateVisibleFields } from "../actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";
import ExportButton from "@/components/ExportButton";
import { exportContactsRows } from "../../contacts/export-actions";

const ALWAYS_SHOWN_FIELDS = new Set(["phone", "first_name", "last_name"]);

export default async function ContactsDisplaySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;
  const isAdmin = role === "admin";

  const { data: fieldSettings } = await supabase
    .from("contact_field_settings")
    .select("visible_fields, show_inactive")
    .eq("id", true)
    .single();
  const visibleFields = new Set(fieldSettings?.visible_fields ?? DEFAULT_VISIBLE_FIELDS);
  const showInactive = fieldSettings?.show_inactive ?? true;

  const configurableFields = CONTACT_FIELD_DEFS.filter((f) => !ALWAYS_SHOWN_FIELDS.has(f.key));
  const sections = Array.from(new Set(configurableFields.map((f) => f.section)));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg font-bold">תצוגת אנשי קשר</h2>
        <ExportButton buttonLabel="ייצוא לאקסל" filename="אנשי קשר" sheetName="אנשי קשר" onExport={exportContactsRows} />
      </div>
      <p className="text-sm text-ink-soft mb-4">
        בחר אילו שדות מתוך פרטי איש הקשר יוצגו כעמודות במסך הרשימה. שדות שלא מסומנים יישארו שמורים במסד הנתונים בלבד.
        שם מלא וטלפון (מזהה) מוצגים תמיד ולכן אינם ברשימה כאן.
      </p>

      {!isAdmin && (
        <p className="text-sm text-wine mb-4">רק מנהל מערכת יכול לשנות הגדרה זו. הרשימה הבאה מוצגת לצפייה בלבד.</p>
      )}

      <SettingsForm action={updateVisibleFields} className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-ink-soft mb-2">כללי</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="show_inactive" defaultChecked={showInactive} disabled={!isAdmin} />
            הצג גם אנשי קשר לא פעילים (כשלא מסומן, יוצגו רק אנשי קשר במצב &quot;פעיל&quot;)
          </label>
        </div>

        {sections.map((section) => (
          <div key={section}>
            <h3 className="text-xs font-semibold text-ink-soft mb-2">{section}</h3>
            <div className="grid grid-cols-2 gap-2">
              {configurableFields
                .filter((f) => f.section === section)
                .map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="visible_fields"
                      value={f.key}
                      defaultChecked={visibleFields.has(f.key)}
                      disabled={!isAdmin}
                    />
                    {f.label}
                  </label>
                ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <SettingsSaveButton />
          </div>
        )}
      </SettingsForm>
    </div>
  );
}
