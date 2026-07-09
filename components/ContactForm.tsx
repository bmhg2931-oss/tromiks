"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { DEPARTMENTS, CONTACT_STATUSES, type Contact } from "@/lib/types";
import { EMAIL_RE } from "@/lib/validation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { sortCityEntries } from "@/lib/cityOrder";
import type { ContactFormResult } from "@/app/(app)/contacts/actions";
import HebrewGregorianDateField from "./HebrewGregorianDateField";
import SaveButton from "./SaveButton";
import AutocompleteInput from "./AutocompleteInput";
import TagsAutocomplete from "./TagsAutocomplete";

function cleanPhoneLike(value: string) {
  return value.replace(/[^\d]/g, "");
}

export default function ContactForm({
  action,
  initial,
  readOnly = false,
  onPendingChange,
  onSuccess,
  onDirty,
}: {
  action: (prevState: ContactFormResult | null, formData: FormData) => Promise<ContactFormResult>;
  initial?: Partial<Contact>;
  readOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onSuccess?: () => void;
  onDirty?: () => void;
}) {
  const [state, formAction] = useFormState(action, null);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [email2Error, setEmail2Error] = useState<string | null>(null);
  const [cities, setCities] = useState<{ city: string; country: string }[]>([]);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    if (state?.ok) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("contact_cities")
      .select("city, country")
      .is("deleted_at", null)
      .then(({ data }) => {
        if (data) setCities(sortCityEntries(data));
      });
    // שולפים בעימוד (fetchAllRows) ולא בקריאה בודדת - PostgREST מגביל כל בקשה ל-1000
    // שורות בברירת מחדל ללא סדר מובטח, כך שבמערכת עם מעל 1000 אנשי קשר תגיות של אנשי
    // קשר "ישנים" עלולות ליפול מחוץ לחלון ולא להופיע כלל ברשימת ההצעות
    fetchAllRows<{ tags: string[] | null }>(() => supabase.from("contacts").select("tags").is("deleted_at", null)).then(
      ({ data }) => {
        const all = Array.from(new Set(data.flatMap((r) => r.tags ?? []))).sort((a, b) => a.localeCompare(b, "he"));
        setAvailableTags(all);
      }
    );
  }, []);

  function handleTagsChange(next: string[]) {
    setTags(next);
    onDirty?.();
  }

  function handleCityChange(value: string) {
    setCity(value);
    const found = cities.find((c) => c.city === value);
    if (found) setCountry(found.country);
    else setCountry("");
  }

  const cityError =
    city.trim() && cities.length > 0 && !cities.some((c) => c.city === city.trim()) ? "יש לבחור עיר מתוך הרשימה בלבד" : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (cityError) e.preventDefault();
  }

  function handlePhoneLikeKeyDown(e: React.KeyboardEvent<HTMLInputElement>, cleanup: () => void) {
    if (e.key === "Enter") {
      e.preventDefault();
      cleanup();
    }
  }

  function validateEmail(value: string, setError: (msg: string | null) => void) {
    if (value && !EMAIL_RE.test(value)) setError("כתובת אימייל לא תקינה");
    else setError(null);
  }

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
    const form = e.currentTarget;
    const focusable = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea")).filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("type") !== "hidden"
    );
    const idx = focusable.indexOf(target);
    if (idx > -1 && idx < focusable.length - 1) {
      // עוד שדה לפניו - עוברים אליו במקום לשלוח את הטופס בטעות
      e.preventDefault();
      focusable[idx + 1].focus();
    }
    // בשדה האחרון: לא מבטלים את ברירת המחדל, כך שאנטר שולח את הטופס כרגיל
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      onChange={() => onDirty?.()}
      className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6"
    >
      <Section title="כללי">
        <Field label="סלולארי ראשי (מזהה) *">
          <input
            name="phone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhone((v) => cleanPhoneLike(v))}
            onKeyDown={(e) => handlePhoneLikeKeyDown(e, () => setPhone((v) => cleanPhoneLike(v)))}
            disabled={readOnly}
            className="in"
          />
        </Field>
        <Field label="תואר">
          <input name="title" defaultValue={initial?.title ?? ""} disabled={readOnly} className="in" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם משפחה *">
            <input name="last_name" required defaultValue={initial?.last_name} disabled={readOnly} className="in" />
          </Field>
          <Field label="שם פרטי">
            <input name="first_name" defaultValue={initial?.first_name} disabled={readOnly} className="in" />
          </Field>
        </div>
        <Field label="שם בן/בת הזוג">
          <input name="spouse_name" defaultValue={initial?.spouse_name ?? ""} disabled={readOnly} className="in" />
        </Field>
      </Section>

      <Section title="מגורים">
        <div className="grid grid-cols-2 gap-3">
          <Field label="רחוב">
            <input name="street" defaultValue={initial?.street ?? ""} disabled={readOnly} className="in" />
          </Field>
          <Field label="מספר">
            <input name="house_number" defaultValue={initial?.house_number ?? ""} disabled={readOnly} className="in" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="עיר">
            {readOnly ? (
              <input value={city} disabled className="in" />
            ) : (
              <AutocompleteInput value={city} onChange={handleCityChange} options={cities.map((c) => c.city)} placeholder="בחר עיר..." />
            )}
            {cityError && <p className="text-xs text-wine mt-1">{cityError}</p>}
            <input type="hidden" name="city" value={city} />
          </Field>
          <Field label="ארץ (אוטומטי)">
            <input name="country" value={country} disabled readOnly className="in bg-parchment text-ink-soft" />
          </Field>
        </div>
        <Field label="מיקוד">
          <input name="postal_code" defaultValue={initial?.postal_code ?? ""} disabled={readOnly} className="in" />
        </Field>
      </Section>

      <Section title="פרטי קשר">
        <Field label="סלולארי ראשי (כפי שהוזן למעלה)">
          <input value={phone} disabled readOnly className="in bg-parchment text-ink-soft" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="סלולארי נוסף">
            <input
              name="mobile_secondary"
              defaultValue={initial?.mobile_secondary ?? ""}
              onBlur={(e) => {
                e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
              }}
              onKeyDown={(e) =>
                handlePhoneLikeKeyDown(e, () => {
                  e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
                })
              }
              disabled={readOnly}
              className="in"
            />
          </Field>
          <Field label="טלפון בית">
            <input
              name="home_phone"
              defaultValue={initial?.home_phone ?? ""}
              onBlur={(e) => {
                e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
              }}
              onKeyDown={(e) =>
                handlePhoneLikeKeyDown(e, () => {
                  e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
                })
              }
              disabled={readOnly}
              className="in"
            />
          </Field>
        </div>
        <Field label="פלאפון נשים">
          <input
            name="wife_mobile"
            defaultValue={initial?.wife_mobile ?? ""}
            onBlur={(e) => {
              e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
            }}
            onKeyDown={(e) =>
              handlePhoneLikeKeyDown(e, () => {
                e.currentTarget.value = cleanPhoneLike(e.currentTarget.value);
              })
            }
            disabled={readOnly}
            className="in"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label='דוא"ל'>
            <input
              name="email"
              type="email"
              defaultValue={initial?.email ?? ""}
              onBlur={(e) => validateEmail(e.target.value, setEmailError)}
              disabled={readOnly}
              className="in"
            />
            {emailError && <p className="text-xs text-wine mt-1">{emailError}</p>}
          </Field>
          <Field label='דוא"ל נוסף'>
            <input
              name="email_secondary"
              type="email"
              defaultValue={initial?.email_secondary ?? ""}
              onBlur={(e) => validateEmail(e.target.value, setEmail2Error)}
              disabled={readOnly}
              className="in"
            />
            {email2Error && <p className="text-xs text-wine mt-1">{email2Error}</p>}
          </Field>
        </div>
      </Section>

      <Section title="פרטים נוספים">
        {initial?.updated_at && (
          <Field label="עדכון אחרון">
            <input value={new Date(initial.updated_at).toLocaleString("he-IL")} disabled readOnly className="in bg-parchment text-ink-soft" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם מלא עם שם האם">
            <input name="full_name_with_mother" defaultValue={initial?.full_name_with_mother ?? ""} disabled={readOnly} className="in" />
          </Field>
          <Field label="שם מלא עם שם האב">
            <input name="full_name_with_father" defaultValue={initial?.full_name_with_father ?? ""} disabled={readOnly} className="in" />
          </Field>
        </div>
        <Field label="שם לדיוור">
          <input name="mailing_name" defaultValue={initial?.mailing_name ?? ""} disabled={readOnly} className="in" />
        </Field>
        <Field label="הערות">
          <textarea name="notes" defaultValue={initial?.notes ?? ""} disabled={readOnly} className="in min-h-[70px]" />
        </Field>
      </Section>

      <Section title="סיווג במערכת">
        <Field label='ת.ז. / מספר עוסק'>
          <input name="id_number" defaultValue={initial?.id_number ?? ""} disabled={readOnly} className="in" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="שיוך למחלקה *">
            <select name="department" defaultValue={initial?.department ?? DEPARTMENTS[0]} disabled={readOnly} className="in">
              {DEPARTMENTS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="סטטוס">
            <select name="status" defaultValue={initial?.status ?? "פעיל"} disabled={readOnly} className="in">
              {CONTACT_STATUSES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <HebrewGregorianDateField name="joined_date" initial={initial?.joined_date} disabled={readOnly} />
        <Field label="תגיות">
          {readOnly ? (
            <input value={tags.join(", ")} disabled className="in" />
          ) : (
            <TagsAutocomplete selected={tags} onChange={handleTagsChange} options={availableTags} placeholder="הקלד תגית..." />
          )}
          <input type="hidden" name="tags" value={tags.join(",")} />
        </Field>
      </Section>

      {state?.error && <p className="md:col-span-2 text-sm text-wine text-center">{state.error}</p>}

      {!readOnly && (
        <div className="md:col-span-2 flex justify-center pt-2">
          <SaveButton onPendingChange={onPendingChange} />
        </div>
      )}

      <style jsx>{`
        .in {
          width: 100%;
          border: 1px solid #ddd9d0;
          border-radius: 8px;
          padding: 8px 11px;
          font-size: 14px;
          background: #fff;
        }
      `}</style>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-serif text-base font-bold mb-3 pb-2 border-b border-line">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-soft mb-1">{label}</label>
      {children}
    </div>
  );
}
