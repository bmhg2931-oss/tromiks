import { createClient } from "@/lib/supabase/server";
import { PAYMENT_HUBS, ALL_CURRENCIES } from "@/lib/types";
import { updateOwnDefaults } from "./actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";

export default async function PersonalSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_payment_hub, default_currency")
    .eq("id", user!.id)
    .single();

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">הגדרות אישיות</h1>
      <div className="bg-white border border-line rounded-xl shadow p-6 max-w-sm">
        <h2 className="font-serif text-lg font-bold mb-1">ברירות מחדל</h2>
        <p className="text-sm text-ink-soft mb-4">
          ההגדרות האישיות הבאות משמשות כברירת מחדל עבורך בלבד, בעת רישום התחייבות או תשלום.
        </p>
        <SettingsForm action={updateOwnDefaults} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">מוקד תשלום ברירת מחדל</label>
            <select
              name="default_payment_hub"
              defaultValue={profile?.default_payment_hub ?? PAYMENT_HUBS[0]}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              {PAYMENT_HUBS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">מטבע קלט ברירת מחדל</label>
            <select
              name="default_currency"
              defaultValue={profile?.default_currency ?? ALL_CURRENCIES[0]}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              {ALL_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end pt-2">
            <SettingsSaveButton />
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
