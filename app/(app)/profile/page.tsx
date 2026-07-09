import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { updateOwnProfile } from "./actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">פרופיל אישי</h1>
      <div className="bg-white border border-line rounded-xl shadow p-6 max-w-md">
        <SettingsForm action={updateOwnProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">שם מלא</label>
            <input
              name="full_name"
              defaultValue={profile?.full_name ?? ""}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">דוא&quot;ל</label>
            <input value={user?.email ?? ""} disabled className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-parchment text-ink-soft" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">דרגת הרשאה</label>
            <input value={ROLE_LABELS[role]} disabled className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-parchment text-ink-soft" />
          </div>
          <div className="flex justify-end pt-2">
            <SettingsSaveButton />
          </div>
        </SettingsForm>
      </div>
    </div>
  );
}
