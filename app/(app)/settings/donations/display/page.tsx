import { createClient } from "@/lib/supabase/server";
import { DONATION_FIELD_DEFS, DEFAULT_VISIBLE_DONATION_FIELDS, type UserRole } from "@/lib/types";
import { updateDonationVisibleFields } from "../actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";
import ExportButton from "@/components/ExportButton";
import { exportDonationsRows } from "../export-actions";

export default async function DonationsDisplaySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;
  const isAdmin = role === "admin";

  const { data: fieldSettings } = await supabase
    .from("donation_field_settings")
    .select("visible_fields")
    .eq("id", true)
    .single();
  const visibleFields = new Set(fieldSettings?.visible_fields ?? DEFAULT_VISIBLE_DONATION_FIELDS);
  const donationFields = DONATION_FIELD_DEFS.filter((f) => !f.key.startsWith("contact_"));
  const contactFields = DONATION_FIELD_DEFS.filter((f) => f.key.startsWith("contact_"));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg font-bold">תצוגת תרומות ותשלומים</h2>
        <ExportButton
          buttonLabel="ייצוא לאקסל"
          filename="תרומות ותשלומים"
          sheetName="תרומות ותשלומים"
          onExport={exportDonationsRows}
        />
      </div>
      <p className="text-sm text-ink-soft mb-4">
        בחר אילו נתונים יוצגו כעמודות במסך תרומות ותשלומים. סוג רשומה, שם תורם וסכום מוצגים תמיד ולכן אינם ברשימה כאן.
      </p>

      {!isAdmin && (
        <p className="text-sm text-wine mb-4">רק מנהל מערכת יכול לשנות הגדרה זו. הרשימה הבאה מוצגת לצפייה בלבד.</p>
      )}

      <SettingsForm action={updateDonationVisibleFields} className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-ink-soft mb-2">פרטי תרומה / התחייבות</h3>
          <div className="grid grid-cols-2 gap-2">
            {donationFields.map((f) => (
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

        <div>
          <h3 className="text-xs font-semibold text-ink-soft mb-2">פרטי איש קשר נוספים</h3>
          <div className="grid grid-cols-2 gap-2">
            {contactFields.map((f) => (
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

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <SettingsSaveButton />
          </div>
        )}
      </SettingsForm>
    </div>
  );
}
