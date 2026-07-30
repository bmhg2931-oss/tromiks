import { createClient } from "@/lib/supabase/server";
import { PAYMENT_HUBS, type UserRole } from "@/lib/types";
import { getOrgSettings, updateOrgSettings } from "../branding-actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";
import OrgLogoUpload from "@/components/OrgLogoUpload";
import RichTextEditor from "@/components/RichTextEditor";

export default async function BrandingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;
  const isAdmin = role === "admin";

  const org = await getOrgSettings();

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">מיתוג ומסמכים</h2>
      <p className="text-sm text-ink-soft mb-4">
        הלוגו והפרטים כאן מופיעים במסמכים המעוצבים שנפתחים מכרטיס איש קשר (דו&quot;ח מסכם וחשבונית).
      </p>

      {!isAdmin && <p className="text-sm text-wine mb-4">רק מנהל מערכת יכול לשנות הגדרה זו.</p>}

      <div className="mb-6">
        <h3 className="text-xs font-semibold text-ink-soft mb-2">לוגו הארגון</h3>
        {isAdmin ? (
          <OrgLogoUpload logoUrl={org.logo_url} />
        ) : (
          <div className="w-20 h-20 rounded-lg border border-line bg-parchment flex items-center justify-center overflow-hidden">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="לוגו הארגון" className="w-full h-full object-contain" />
            ) : (
              <span className="text-xs text-ink-soft">אין לוגו</span>
            )}
          </div>
        )}
      </div>

      <SettingsForm action={updateOrgSettings} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">שם הארגון</label>
          <input name="org_name" defaultValue={org.org_name} disabled={!isAdmin} className="in" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">הערת כותרת במסמך (אופציונלי)</label>
          <RichTextEditor
            name="report_header_note"
            defaultValue={org.report_header_note ?? ""}
            placeholder='למשל: קהל חסידי טשערנאביל'
            readOnly={!isAdmin}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">חתימה בתחתית המסמך (אופציונלי)</label>
          <RichTextEditor
            name="report_signature"
            defaultValue={org.report_signature ?? ""}
            placeholder="למשל: בברכה, ועד הקהילה"
            readOnly={!isAdmin}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">טקסט בגוף החשבונית</label>
          <RichTextEditor
            name="invoice_body_text"
            defaultValue={org.invoice_body_text ?? ""}
            placeholder='הננו לפנות לידיעתך בדבר נדרים ונדבות וכו&apos; אשר נדר/נדב במשך ימי השנה ועדיין לא שולם'
            readOnly={!isAdmin}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">קישורי תשלום לפי מוקד (לכפתור בהודעת המייל)</label>
          <div className="space-y-2">
            {PAYMENT_HUBS.map((hub, i) => (
              <div key={hub} className="flex items-center gap-2">
                <span className="text-xs w-16 shrink-0">{hub}</span>
                <input type="hidden" name={`payment_link_hub_${i}`} value={hub} />
                <input
                  name={`payment_link_url_${i}`}
                  type="text"
                  defaultValue={org.payment_links?.[hub] ?? ""}
                  disabled={!isAdmin}
                  placeholder="https://..."
                  className="in text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">כותרת ברירת מחדל להודעת המייל</label>
          <p className="text-[11px] text-ink-soft mb-1">אפשר להשתמש ב-{"{שם}"} וב-{"{כותרת}"} כתחליפים לשם איש הקשר ולכותרת המסמך</p>
          <input
            name="email_default_subject"
            defaultValue={org.email_default_subject ?? ""}
            disabled={!isAdmin}
            placeholder="{כותרת} - שם הארגון"
            className="in text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">טקסט ברירת מחדל לגוף הודעת המייל</label>
          <textarea
            name="email_default_body"
            defaultValue={org.email_default_body ?? ""}
            disabled={!isAdmin}
            rows={5}
            className="in text-sm min-h-[100px]"
          />
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
