"use client";

import { useRef } from "react";

// עורך טקסט עשיר קליל מבוסס contentEditable + document.execCommand - מספיק
// לצרכים הפשוטים כאן (הדגשה, יישור, גודל, צבע, ירידות שורה) בלי להוסיף תלות
// חיצונית כבדה של ספריית עריכה מלאה. ה-HTML שנוצר נשמר כמו שהוא ומוזרק ישירות
// (ללא escape) לתוך מסמכי הדו"ח/החשבונית - הסניטציה מתבצעת בזמן השמירה בשרת.
export default function RichTextEditor({
  name,
  defaultValue,
  placeholder,
  readOnly = false,
}: {
  name: string;
  defaultValue: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  function sync() {
    // ה-div עם contentEditable אינו "אלמנט טופס" מוכר עבור מנגנון onChange של React,
    // כך שעדכון ישיר של ה-input המוסתר לא בהכרח מבעבע ל-onChange של הטופס העוטף
    // (למשל דגל ה"dirty" ב-SettingsForm) - שיגור אירוע input אמיתי על ה-input עצמו
    // פותר את זה, כי הוא כן אלמנט טופס אמיתי שה-bubble ממנו כן נתפס.
    if (!hiddenRef.current || !editorRef.current) return;
    hiddenRef.current.value = editorRef.current.innerHTML;
    hiddenRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }

  return (
    <div>
      {!readOnly && (
        <div className="flex items-center gap-1 flex-wrap border border-line rounded-t-lg border-b-0 bg-parchment/50 p-1.5">
          <button type="button" onClick={() => exec("bold")} className="toolbar-btn font-bold" title="הדגשה">
            B
          </button>
          <button type="button" onClick={() => exec("italic")} className="toolbar-btn italic" title="נטוי">
            I
          </button>
          <button type="button" onClick={() => exec("underline")} className="toolbar-btn underline" title="קו תחתון">
            U
          </button>
          <span className="w-px h-5 bg-line mx-0.5" />
          <button type="button" onClick={() => exec("justifyRight")} className="toolbar-btn" title="יישור לימין">
            ⇥
          </button>
          <button type="button" onClick={() => exec("justifyCenter")} className="toolbar-btn" title="מרכוז">
            ≡
          </button>
          <button type="button" onClick={() => exec("justifyLeft")} className="toolbar-btn" title="יישור לשמאל">
            ⇤
          </button>
          <span className="w-px h-5 bg-line mx-0.5" />
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) exec("fontSize", e.target.value);
              e.target.value = "";
            }}
            className="text-xs border border-line rounded px-1 py-1 bg-white"
            title="גודל גופן"
          >
            <option value="">גודל</option>
            <option value="2">קטן</option>
            <option value="3">רגיל</option>
            <option value="5">גדול</option>
            <option value="6">גדול מאוד</option>
            <option value="7">ענק</option>
          </select>
          <input
            type="color"
            onChange={(e) => exec("foreColor", e.target.value)}
            className="w-7 h-7 border border-line rounded cursor-pointer"
            title="צבע טקסט"
            defaultValue="#33463a"
          />
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        dangerouslySetInnerHTML={{ __html: defaultValue }}
        data-placeholder={placeholder}
        dir="rtl"
        className={`rich-editor border border-line bg-white min-h-[96px] px-3 py-2 text-sm leading-relaxed focus:outline-none ${readOnly ? "rounded-lg bg-parchment/40" : "rounded-b-lg"}`}
      />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultValue} />
      <style jsx>{`
        .toolbar-btn {
          width: 26px;
          height: 26px;
          font-size: 13px;
          border: 1px solid #ddd9d0;
          border-radius: 6px;
          background: white;
        }
        .toolbar-btn:hover {
          background: #f5f4ef;
        }
        .rich-editor:empty:before {
          content: attr(data-placeholder);
          color: #9a998f;
        }
      `}</style>
    </div>
  );
}
