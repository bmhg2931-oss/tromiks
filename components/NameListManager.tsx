"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PlusIcon, TrashIcon, DragHandleIcon } from "./icons";

type Item = { id: string; name: string; active: boolean };

function SortableRow({
  item,
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
  onToggleActive,
  onRequestDelete,
}: {
  item: Item;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onToggleActive: () => void;
  onRequestDelete: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  function handleDragStart(e: React.DragEvent) {
    onDragStart();
    if (rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(rowRef.current, e.clientX - rect.left, e.clientY - rect.top);
    }
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      ref={rowRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`flex items-center gap-2 px-2 py-2 border-b border-line last:border-b-0 transition ${
        !item.active ? "opacity-50" : ""
      } ${isDragging ? "bg-parchment" : ""}`}
    >
      <span
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        aria-label="גרירה לשינוי סדר"
        className="cursor-grab active:cursor-grabbing text-ink-soft shrink-0 px-1"
      >
        <DragHandleIcon />
      </span>
      <span className="text-sm flex-1">{item.name}</span>
      <button
        type="button"
        role="switch"
        aria-checked={item.active}
        aria-label={item.active ? "פעילה - לחץ להשבתה" : "לא פעילה - לחץ להפעלה"}
        onClick={onToggleActive}
        className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${item.active ? "bg-brass" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
            item.active ? "left-4" : "left-0.5"
          }`}
        />
      </button>
      <button
        type="button"
        onClick={onRequestDelete}
        aria-label={`מחיקת ${item.name}`}
        className="text-wine hover:bg-wine hover:text-white rounded-md w-7 h-7 flex items-center justify-center transition shrink-0"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

export default function NameListManager({
  items,
  onAdd,
  onDelete,
  onToggleActive,
  onReorder,
  placeholder,
}: {
  items: Item[];
  onAdd: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<void>;
  onToggleActive: (id: string, active: boolean) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  placeholder: string;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [orderedItems, setOrderedItems] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  function handleAdd() {
    if (!newName.trim()) {
      setError("יש להזין שם לפני ההוספה");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("name", newName.trim());
    startTransition(async () => {
      const result = await onAdd(fd);
      if (!result.ok) setError(result.error ?? "שגיאה בהוספה");
      else setNewName("");
    });
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const current = [...orderedItems];
    const fromIdx = current.findIndex((i) => i.id === dragId);
    const toIdx = current.findIndex((i) => i.id === targetId);
    setDragId(null);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    setOrderedItems(current);
    startTransition(() => onReorder(current.map((i) => i.id)));
  }

  const itemToDelete = orderedItems.find((i) => i.id === confirmDeleteId);

  return (
    <div className="space-y-3 max-w-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          aria-label="הוספה"
          className="w-9 h-9 shrink-0 rounded-full bg-brass hover:bg-brass-deep text-white flex items-center justify-center transition disabled:opacity-60"
        >
          <PlusIcon />
        </button>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 border border-line rounded-lg px-3 py-2 text-sm bg-white"
        />
      </div>
      {error && <p className="text-xs text-wine">{error}</p>}

      <div className="border border-line rounded-xl overflow-hidden">
        {orderedItems.length === 0 ? (
          <div className="text-center text-ink-soft text-sm p-4">אין רשומות עדיין</div>
        ) : (
          orderedItems.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              isDragging={dragId === item.id}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => setDragId(null)}
              onDrop={() => handleDrop(item.id)}
              onToggleActive={() => startTransition(() => onToggleActive(item.id, !item.active))}
              onRequestDelete={() => setConfirmDeleteId(item.id)}
            />
          ))
        )}
      </div>

      {confirmDeleteId && itemToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-line/60 p-6 max-w-xs w-full text-center">
            <p className="text-sm font-semibold mb-2">למחוק את &quot;{itemToDelete.name}&quot;?</p>
            <p className="text-xs text-ink-soft mb-4">
              מחיקה לא תשפיע על רשומות קיימות שכבר משויכות אליה — הן ימשיכו להציג את השם הזה.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  const id = confirmDeleteId;
                  setConfirmDeleteId(null);
                  startTransition(() => onDelete(id));
                }}
                className="bg-wine hover:bg-wine/90 text-white rounded-full px-4 py-2 text-sm font-semibold transition"
              >
                מחיקה
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="border border-line rounded-full px-4 py-2 text-sm hover:bg-parchment transition"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
