import { notFound } from "next/navigation";
import ContactForm from "@/components/ContactForm";
import { createClient } from "@/lib/supabase/server";
import { canEditContacts, type UserRole } from "@/lib/types";
import { updateContact } from "../actions";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const role = (profile?.role ?? "secretary") as UserRole;
  const readOnly = !canEditContacts(role);

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (!contact) notFound();

  const { data: donations } = await supabase
    .from("donations")
    .select("*")
    .eq("contact_id", id)
    .order("donation_date", { ascending: false });

  const boundUpdate = updateContact.bind(null, id);

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold mb-5">
        {contact.first_name} {contact.last_name}
      </h1>
      <div className="bg-white border border-line rounded-xl shadow p-6 mb-6">
        <ContactForm action={boundUpdate} initial={contact} readOnly={readOnly} />
      </div>

      <h2 className="font-serif text-lg font-bold mb-3">היסטוריית תרומות</h2>
      <div className="bg-white border border-line rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="p-2.5">תאריך</th>
              <th className="p-2.5">סכום</th>
              <th className="p-2.5">ייעוד</th>
              <th className="p-2.5">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {donations && donations.length > 0 ? (
              donations.map((d) => (
                <tr key={d.id} className="border-b border-[#e6e3da]">
                  <td className="p-2.5">{d.donation_date}</td>
                  <td className="p-2.5">₪{Number(d.amount).toLocaleString("he-IL")}</td>
                  <td className="p-2.5">{d.purpose}</td>
                  <td className="p-2.5">
                    <span className={`pill pill-${statusClass(d.status)}`}>{d.status}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="text-center text-ink-soft p-6">
                  אין תרומות רשומות עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusClass(s: string) {
  return { "שולם": "paid", "ממתין": "pending", "נכשל": "failed", "בוטל": "cancelled", "מוחזר": "refunded" }[s] || "pending";
}
