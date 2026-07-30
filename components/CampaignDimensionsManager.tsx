"use client";

import { useState, useTransition } from "react";
import { PlusIcon, TrashIcon } from "./icons";

export type DimensionWithLevels = {
  id: string;
  name: string;
  levels: { id: string; label: string }[];
};

export default function CampaignDimensionsManager({
  dimensions,
  onAddDimension,
  onDeleteDimension,
  onAddLevel,
  onDeleteLevel,
}: {
  dimensions: DimensionWithLevels[];
  onAddDimension: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteDimension: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onAddLevel: (dimensionId: string, label: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteLevel: (levelId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [newDimension, setNewDimension] = useState("");
  const [newLevelByDimension, setNewLevelByDimension] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAddDimension() {
    if (!newDimension.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await onAddDimension(newDimension.trim());
      if (!result.ok) setError(result.error ?? "שגיאה בהוספה");
      else setNewDimension("");
    });
  }

  function handleAddLevel(dimensionId: string) {
    const label = (newLevelByDimension[dimensionId] || "").trim();
    if (!label) return;
    setError(null);
    startTransition(async () => {
      const result = await onAddLevel(dimensionId, label);
      if (!result.ok) setError(result.error ?? "שגיאה בהוספה");
      else setNewLevelByDimension((prev) => ({ ...prev, [dimensionId]: "" }));
    });
  }

  return (
    <div className="bg-white border border-line rounded-xl shadow p-4">
      <h3 className="font-serif text-base font-bold mb-3">ממדי דירוג מותאמים לקמפיין זה</h3>
      <p className="text-xs text-ink-soft mb-3">
        לכל ממד (למשל &quot;יכולת כלכלית&quot; או &quot;זיקה לקהילה&quot;) אפשר להגדיר את הדרגות (תפריט נפתח) שיוצגו בעת מיפוי אנשי הקשר.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={handleAddDimension}
          disabled={pending}
          aria-label="הוספת ממד"
          className="w-8 h-8 shrink-0 rounded-full bg-brass hover:bg-brass-deep text-white flex items-center justify-center transition disabled:opacity-60"
        >
          <PlusIcon />
        </button>
        <input
          type="text"
          value={newDimension}
          onChange={(e) => setNewDimension(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddDimension())}
          placeholder="שם ממד חדש..."
          className="flex-1 border border-line rounded-lg px-3 py-1.5 text-sm bg-white"
        />
      </div>

      {error && <p className="text-xs text-wine mb-3">{error}</p>}

      {dimensions.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין ממדי דירוג מותאמים לקמפיין זה.</p>
      ) : (
        <div className="space-y-4">
          {dimensions.map((d) => (
            <div key={d.id} className="border border-line rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{d.name}</span>
                <button
                  type="button"
                  onClick={() => startTransition(async () => { await onDeleteDimension(d.id); })}
                  aria-label={`מחיקת ${d.name}`}
                  className="text-wine hover:bg-wine hover:text-white rounded-md w-6 h-6 flex items-center justify-center transition"
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {d.levels.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-parchment-deep border border-line">
                    {l.label}
                    <button
                      type="button"
                      onClick={() => startTransition(async () => { await onDeleteLevel(l.id); })}
                      className="hover:opacity-70"
                      aria-label={`הסרת ${l.label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLevelByDimension[d.id] || ""}
                  onChange={(e) => setNewLevelByDimension((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLevel(d.id))}
                  placeholder="דרגה חדשה..."
                  className="flex-1 border border-line rounded-lg px-2.5 py-1 text-xs bg-white"
                />
                <button
                  type="button"
                  onClick={() => handleAddLevel(d.id)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-line hover:bg-parchment transition"
                >
                  הוספה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
