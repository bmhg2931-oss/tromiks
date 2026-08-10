"use client";

import type { Contact } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-serif text-base font-bold mb-3 pb-2 border-b border-line">{title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function ReadField({ label, value, full = false }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <div className="text-xs font-semibold text-ink-soft mb-0.5">{label}</div>
      <div className="text-sm whitespace-pre-wrap break-words">{value && value.trim() ? value : "—"}</div>
    </div>
  );
}

// תצוגה קריאה בלבד לפרטי איש קשר - אותו סדר/קיבוץ שדות בדיוק כמו ContactForm.tsx,
// כדי שהמעבר בין תצוגה לעריכה לא יבלבל (אותם שמות שדות, אותו מיקום). כפתור
// "עריכה" פותח את ContactForm הרגיל (ר' ContactDetailPanel.tsx)
export default function ContactDetailsView({
  contact,
  editable,
  onEdit,
}: {
  contact: Contact;
  editable: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="relative">
      {editable && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute left-0 top-0 bg-brass hover:bg-brass-deep text-white text-xs font-semibold rounded-full px-4 h-8 transition"
        >
          עריכה
        </button>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-1">
        <Section title="כללי">
          <ReadField label="סלולארי ראשי (מזהה)" value={contact.phone} />
          <ReadField label="תואר" value={contact.title} />
          <ReadField label="שם משפחה" value={contact.last_name} />
          <ReadField label="שם פרטי" value={contact.first_name} />
          <ReadField label="שם האשה" value={contact.spouse_name} full />
        </Section>

        <Section title="מגורים">
          <ReadField label="רחוב" value={contact.street} />
          <ReadField label="מספר" value={contact.house_number} />
          <ReadField label="עיר" value={contact.city} />
          <ReadField label="ארץ" value={contact.country} />
          <ReadField label="מיקוד" value={contact.postal_code} full />
        </Section>

        <Section title="פרטי קשר">
          <ReadField label="סלולארי נוסף" value={contact.mobile_secondary} />
          <ReadField label="טלפון בית" value={contact.home_phone} />
          <ReadField label="פלאפון נשים" value={contact.wife_mobile} full />
          <ReadField label='דוא"ל' value={contact.email} />
          <ReadField label='דוא"ל נוסף' value={contact.email_secondary} />
        </Section>

        <Section title="פרטים נוספים">
          <ReadField label="שם מלא עם שם האם" value={contact.full_name_with_mother} />
          <ReadField label="שם מלא עם שם האב" value={contact.full_name_with_father} />
          <ReadField label="שם האב" value={contact.father_name} />
          <ReadField label="שם החותן" value={contact.father_in_law_name} />
          <ReadField label="שם לדיוור" value={contact.mailing_name} full />
          <ReadField label="הערות" value={contact.notes} full />
        </Section>

        <Section title="סיווג במערכת">
          <ReadField label='ת.ז. / מספר עוסק' value={contact.id_number} />
          <ReadField label="ת.ז. אישה" value={contact.wife_id_number} />
          <ReadField label="שיוך למחלקה" value={contact.department} />
          <ReadField label="סטטוס" value={contact.status} />
          <ReadField label="תאריך הצטרפות" value={contact.joined_date ? new Date(contact.joined_date).toLocaleDateString("he-IL") : null} />
          <ReadField label="תגיות" value={contact.tags?.length ? contact.tags.join(", ") : null} />
        </Section>
      </div>
    </div>
  );
}
