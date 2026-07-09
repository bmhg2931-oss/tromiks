"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function TagsAutocomplete({
  selected,
  onChange,
  options,
  placeholder = "הקלד תגית...",
}: {
  selected: string[];
  onChange: (tags: string[]) => void;
  options: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // בפוקוס (טרם הוקלד טקסט) מוצגות כל התגיות הקיימות שטרם נבחרו; ברגע שמתחילים להקליד
  // הרשימה מסוננת לפי ההקלדה (הכלה תת-מחרוזתית, לא תלוית רישיות)
  const remaining = options.filter((o) => !selected.includes(o));
  const trimmed = text.trim();
  const filtered = trimmed ? remaining.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase())) : remaining;
  const exactMatch = remaining.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const canCreateNew = trimmed.length > 0 && !exactMatch && !selected.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  // הרשימה הנפתחת מוצגת דרך פורטל ב-position:fixed לפי מיקום השדה בפועל על המסך, ולא
  // כ-absolute בתוך העץ המקומי - כדי שלא תיחתך ע"י מכולות עם overflow (כמו גוף המודל
  // הגלול של טופס איש קשר) כשהשדה קרוב לתחתית האזור הגלול
  function updateRect() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  function openDropdown() {
    updateRect();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleScrollOrResize() {
      updateRect();
    }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  function addTag(t: string) {
    onChange([...selected, t]);
    setText("");
    setOpen(false);
  }

  function removeTag(t: string) {
    onChange(selected.filter((x) => x !== t));
  }

  // מוסיף בפועל את הטקסט המוקלד כרגע כתגית (קיימת או חדשה) - משמש גם ב-Enter וגם
  // ב-blur, כדי שתגית לא "תאבד" אם המשתמש הקליד וישר עבר לשמירה בלי ללחוץ Enter
  function commitPending() {
    if (!trimmed) return;
    const existing = remaining.find((o) => o.toLowerCase() === trimmed.toLowerCase());
    if (existing) addTag(existing);
    else if (canCreateNew) addTag(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // אם הסינון הנוכחי משאיר הצעה יחידה, אנטר בוחר אותה ישירות גם אם הטקסט לא זהה לה
    // מילה במילה (למשל הקלדה חלקית)
    if (filtered.length === 1) addTag(filtered[0]);
    else commitPending();
  }

  return (
    <div ref={wrapRef}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-brass text-white">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="hover:opacity-70" aria-label={`הסרת ${t}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          openDropdown();
        }}
        onFocus={openDropdown}
        onKeyDown={handleKeyDown}
        onBlur={commitPending}
        placeholder={placeholder}
        autoComplete="off"
        className="in"
      />
      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-[200] bg-white border border-line rounded-lg shadow-lg max-h-40 overflow-y-auto"
          >
            {filtered.length > 0 ? (
              filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(o)}
                  className="block w-full text-right px-3 py-1.5 text-sm hover:bg-parchment border-b border-line last:border-b-0"
                >
                  {o}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-ink-soft">
                {trimmed ? `אין תגית קיימת בשם "${trimmed}" - הקש Enter ליצירת תגית חדשה` : "אין עדיין תגיות קיימות במערכת - הקלד ליצירת תגית ראשונה"}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
