"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addContactCity, updateContactCity, deleteContactCity } from "@/app/(app)/settings/contacts/cities-actions";
import { TrashIcon } from "./icons";

type CityItem = { id: string; city: string; country: string; contactCount: number };

function CityRow({ item }: { item: CityItem }) {
  const router = useRouter();
  const [city, setCity] = useState(item.city);
  const [country, setCountry] = useState(item.country);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = city !== item.city || country !== item.country;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateContactCity(item.id, city, country);
    setSaving(false);
    if (!result.ok) setError(result.error ?? "שגיאה");
    else router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`למחוק את "${item.city}" מרשימת הערים?`)) return;
    await deleteContactCity(item.id);
    router.refresh();
  }

  return (
    <tr className="border-b border-line/60">
      <td className="p-1.5">
        <input value={city} onChange={(e) => setCity(e.target.value)} className="in !w-32 !py-1" />
      </td>
      <td className="p-1.5">
        <input value={country} onChange={(e) => setCountry(e.target.value)} className="in !w-28 !py-1" />
      </td>
      <td className="p-1.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-full bg-brass text-white hover:bg-brass-deep transition disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמירה"}
            </button>
          )}
          <span className="text-xs text-ink-soft whitespace-nowrap" title="מספר אנשי קשר בעיר זו">
            {item.contactCount} אנשי קשר
          </span>
          <button
            type="button"
            onClick={handleDelete}
            aria-label="מחיקה"
            className="w-8 h-8 rounded-full flex items-center justify-center text-wine hover:bg-wine/10 transition shrink-0"
          >
            <TrashIcon />
          </button>
        </div>
        {error && <p className="text-xs text-wine mt-1">{error}</p>}
      </td>
    </tr>
  );
}

export default function CityListManager({ items }: { items: CityItem[] }) {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    const formData = new FormData();
    formData.set("city", city);
    formData.set("country", country);
    const result = await addContactCity(formData);
    setAdding(false);
    if (!result.ok) {
      setError(result.error ?? "שגיאה");
      return;
    }
    setCity("");
    setCountry("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-end gap-2 mb-4">
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">עיר חדשה</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="שם העיר..." className="in !w-32" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">ארץ</label>
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="שם הארץ..." className="in !w-28" />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !city.trim() || !country.trim()}
          className="h-9 px-4 rounded-full bg-brass hover:bg-brass-deep text-white text-sm font-semibold transition disabled:opacity-50"
        >
          {adding ? "מוסיף..." : "הוספה"}
        </button>
      </div>
      {error && <p className="text-sm text-wine mb-3">{error}</p>}

      <div className="bg-white border border-line rounded-xl overflow-hidden inline-block">
        <table className="text-sm">
          <thead>
            <tr className="text-right text-xs text-ink-soft border-b-2 border-line">
              <th className="p-1.5">עיר</th>
              <th className="p-1.5">ארץ</th>
              <th className="p-1.5">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => <CityRow key={item.id} item={item} />)
            ) : (
              <tr>
                <td colSpan={3} className="text-center text-ink-soft p-6">
                  אין ערים ברשימה עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
