import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import SignOutButton from "@/components/SignOutButton";
import UserMenu from "@/components/UserMenu";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, approved")
    .eq("id", user.id)
    .single();

  if (profile && !profile.approved) redirect("/pending-approval");

  const role = (profile?.role ?? "secretary") as UserRole;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .is("parent_campaign_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen flex">
      <Sidebar campaigns={campaigns ?? []} />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mr-auto bg-gradient-to-b from-ink to-[#243024] text-[#eef2e4] pr-24 pl-5 py-3.5 flex items-center gap-3 shadow sticky top-0 z-30 rounded-br-3xl">
          <ThemeToggle />
          <UserMenu name={profile?.full_name || user.email || ""} roleLabel={ROLE_LABELS[role]} />
          <SignOutButton />
        </div>

        <main className="max-w-[1600px] mx-auto px-8 pt-0 pb-16 w-full">{children}</main>
      </div>
    </div>
  );
}
