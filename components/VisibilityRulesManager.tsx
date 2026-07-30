"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addVisibilityRule, deleteVisibilityRule, type VisibilityRule } from "@/app/(app)/settings/contacts/visibility-actions";
import { ROLE_LABELS, CONTACT_FIELD_DEFS, type UserRole } from "@/lib/types";
import AutocompleteInput from "./AutocompleteInput";

type ProfileOption = { id: string; full_name: string | null };

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];
const SECTION_LABELS: Record<string, string> = { donations: "תרומות והתחייבויות", files: "קבצים מצורפים" };

function describeRule(r: VisibilityRule): string {
  if (r.hide_contact) return "הסתרת הכרטיס כולו";
  const parts: string[] = [];
  if (r.hidden_sections?.length) parts.push(r.hidden_sections.map((s) => SECTION_LABELS[s] ?? s).join(", "));
  if (r.hidden_fields?.length) parts.push(`שדות: ${r.hidden_fields.join(", ")}`);
  return parts.join(" · ") || "—";
}

export default function VisibilityRulesManager({
  rules,
  availableTags,
  profiles,
}: {
  rules: VisibilityRule[];
  availableTags: string[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [tag, setTag] = useState("");
  const [scopeType, setScopeType] = useState<"role" | "user">("role");
  const [role, setRole] = useState<UserRole>("gabai");
  const [userId, setUserId] = useState("");
  const [hideContact, setHideContact] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [hiddenFields, setHiddenFields] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleField(key: string) {
    setHiddenFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleSection(key: string) {
    setHiddenSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("tag", tag);
    formData.set("scope_type", scopeType);
    if (scopeType === "role") formData.set("role", role);
    else formData.set("user_id", userId);
    if (hideContact) formData.set("hide_contact", "on");
    hiddenSections.forEach((s) => formData.append("hidden_sections", s));
    hiddenFields.forEach((f) => formData.append("hidden_fields", f));
    const res = await addVisibilityRule(formData);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "שגיאה בהוספת הכלל");
      return;
    }
    setTag("");
    setHideContact(false);
    setHiddenSections([]);
    setHiddenFields([]);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteVisibilityRule(id);
    setDeletingId(null);
    router.refresh();
  }

  const restrictionsDisabled = hideContact;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="bg-white border border-line rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">תגית</label>
          <AutocompleteInput value={tag} onChange={setTag} options={availableTags} placeholder="בחר תגית..." />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">ההגבלה חלה על</label>
          <div className="flex gap-4 text-sm mb-2">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scopeType === "role"} onChange={() => setScopeType("role")} /> תפקיד
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scopeType === "user"} onChange={() => setScopeType("user")} /> משתמש ספציפי
            </label>
          </div>
          {scopeType === "role" ? (
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="in">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          ) : (
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="in">
              <option value="">בחר משתמש...</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.id}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-soft mb-1">מה להסתיר (ניתן לשלב כמה אפשרויות)</label>
          <label className="flex items-center gap-1.5 text-sm mb-2">
            <input type="checkbox" checked={hideContact} onChange={(e) => setHideContact(e.target.checked)} />
            הסתרת כרטיס איש הקשר כולו (חסימה מלאה - לא ניתן לשילוב עם שאר האפשרויות)
          </label>

          <div className={restrictionsDisabled ? "opacity-40 pointer-events-none" : ""}>
            <div className="flex gap-4 text-sm mb-2">
              {Object.entries(SECTION_LABELS).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={hiddenSections.includes(key)} onChange={() => toggleSection(key)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_FIELD_DEFS.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={hiddenFields.includes(f.key)} onChange={() => toggleField(f.key)} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-wine">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !tag}
            className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 py-2 text-sm transition disabled:opacity-50"
          >
            {submitting ? "מוסיף..." : "הוספת כלל"}
          </button>
        </div>

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

      <div className="bg-white border border-line rounded-xl divide-y divide-line/60">
        {rules.length === 0 ? (
          <p className="text-sm text-ink-soft p-4">אין כללי הרשאה מוגדרים</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <span className="pill bg-parchment-deep text-ink-soft ml-2">{r.tag}</span>
                חסום מ{r.scope_type === "role" ? ROLE_LABELS[r.role as UserRole] : r.user_name} — {describeRule(r)}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="shrink-0 text-xs text-wine border border-wine/40 rounded-full px-3 py-1.5 hover:bg-wine hover:text-white transition disabled:opacity-50"
              >
                {deletingId === r.id ? "מוחק..." : "מחיקה"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
