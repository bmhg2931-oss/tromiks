import SettingsSidebar from "@/components/SettingsSidebar";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = ((profile?.role ?? "secretary") as UserRole) === "admin";

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">הגדרות מערכת</h1>
      <SettingsSidebar isAdmin={isAdmin}>{children}</SettingsSidebar>
    </div>
  );
}
