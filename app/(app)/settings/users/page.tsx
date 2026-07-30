import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { updateUserRole, approveUser } from "./actions";
import SettingsForm from "@/components/SettingsForm";
import SettingsSaveButton from "@/components/SettingsSaveButton";
import DeleteUserButton from "@/components/DeleteUserButton";

export default async function UsersSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase.from("profiles").select("role, is_super_admin").eq("id", user!.id).single();
  const myRole = (myProfile?.role ?? "secretary") as UserRole;
  const isAdmin = myRole === "admin";
  const isSuperAdmin = myProfile?.is_super_admin ?? false;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, approved")
    .order("approved", { ascending: true })
    .order("full_name");

  return (
    <div>
      <h2 className="font-serif text-lg font-bold mb-1">משתמשים והרשאות</h2>
      <p className="text-sm text-ink-soft mb-4">
        ניהול דרגות הרשאה של משתמשי המערכת. משתמש חדש שנרשם (במייל או דרך Google) ממתין לאישור ואינו יכול להיכנס
        למערכת עד שתקבע/י לו תפקיד ותאשר/י אותו.
      </p>

      {!isAdmin && (
        <p className="text-sm text-wine mb-4">רק מנהל מערכת יכול לשנות הרשאות. הרשימה הבאה מוצגת לצפייה בלבד.</p>
      )}

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="p-2.5">שם</th>
              <th className="p-2.5">דרגת הרשאה</th>
              {isSuperAdmin && <th className="p-2.5">פעולות</th>}
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const pending = !p.approved;
              const boundApprove = approveUser.bind(null, p.id);
              const boundUpdate = updateUserRole.bind(null, p.id);
              const isMe = p.id === user!.id;
              return (
                <tr key={p.id} className={`border-b border-[#e6e3da] ${pending ? "bg-[#fdf6e3]" : ""}`}>
                  <td className="p-2.5">
                    {p.full_name || "—"}
                    {isMe && <span className="text-xs text-ink-soft"> (אתה)</span>}
                    {pending && <span className="pill pill-pending mr-2">ממתין לאישור</span>}
                  </td>
                  <td className="p-2.5">
                    {isAdmin ? (
                      pending ? (
                        <form action={boundApprove} className="flex items-center gap-2">
                          <select
                            name="role"
                            defaultValue={p.role}
                            className="border border-line rounded-lg px-2 py-1 text-sm bg-white"
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="text-xs bg-brass hover:bg-brass-deep text-white font-semibold rounded-md px-3 py-1.5 transition"
                          >
                            אישור
                          </button>
                        </form>
                      ) : (
                        <SettingsForm action={boundUpdate} className="flex items-center gap-2">
                          <select
                            name="role"
                            defaultValue={p.role}
                            className="border border-line rounded-lg px-2 py-1 text-sm bg-white"
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <SettingsSaveButton className="text-xs border border-line rounded-md px-3 py-1.5 bg-white hover:bg-parchment disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white" />
                        </SettingsForm>
                      )
                    ) : (
                      ROLE_LABELS[p.role as UserRole]
                    )}
                  </td>
                  {isSuperAdmin && (
                    <td className="p-2.5">
                      {!isMe && <DeleteUserButton userId={p.id} name={p.full_name || "משתמש זה"} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
