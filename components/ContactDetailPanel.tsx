"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import ContactForm from "./ContactForm";
import CloseConfirm from "./CloseConfirm";
import TabBar from "./TabBar";
import ContactHistoryTab from "./ContactHistoryTab";
import ContactActivityTab from "./ContactActivityTab";
import ContactFilesTab from "./ContactFilesTab";
import { updateContact } from "@/app/(app)/contacts/actions";
import { fetchContactForView } from "@/app/(app)/contacts/view-actions";
import { fetchContactHistory, type ContactHistoryRow } from "@/app/(app)/contacts/history-actions";
import { listContactFiles, type ContactFileRow } from "@/app/(app)/contacts/files-actions";
import type { Contact } from "@/lib/types";

type TabKey = "details" | "history" | "activity" | "files";
type NamedItem = { id: string; name: string };

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "פרטי איש קשר" },
  { key: "history", label: "היסטוריית תרומות" },
  { key: "activity", label: "פעילות לקוח" },
  { key: "files", label: "קבצים" },
];

export default function ContactDetailPanel({
  id,
  editable,
  onClose,
  initialTab = "details",
}: {
  id: string;
  editable: boolean;
  onClose: () => void;
  initialTab?: TabKey;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [categories, setCategories] = useState<NamedItem[]>([]);
  const [handlers, setHandlers] = useState<NamedItem[]>([]);
  const [historyRows, setHistoryRows] = useState<ContactHistoryRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [files, setFiles] = useState<ContactFileRow[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [hasRedactions, setHasRedactions] = useState(false);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab);

  async function loadHistory() {
    const res = await fetchContactHistory(id);
    if (res.ok) {
      setHistoryRows(res.rows ?? []);
      setHistoryError(null);
    } else {
      setHistoryError(res.error ?? "שגיאה בטעינת היסטוריה");
    }
  }

  async function loadFiles() {
    const res = await listContactFiles(id);
    if (res.ok) {
      setFiles(res.files ?? []);
      setFilesError(null);
    } else {
      setFilesError(res.error ?? "שגיאה בטעינת קבצים");
    }
  }

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [viewRes, { data: cats }, { data: hands }] = await Promise.all([
        fetchContactForView(id),
        supabase.from("donation_categories").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("donation_handlers").select("id, name").is("deleted_at", null).order("sort_order"),
      ]);
      if (cancelled) return;
      setContact(viewRes.ok ? viewRes.contact ?? null : null);
      setHasRedactions(Boolean(viewRes.hasRedactions));
      setHiddenSections(viewRes.hiddenSections ?? []);
      setCategories(cats ?? []);
      setHandlers(hands ?? []);
      setLoading(false);
    })();
    // כל הטאבים נטענים במקביל לפתיחת החלון (לא רק כשהמשתמש לוחץ עליהם) כדי שהמעבר
    // בין לשוניות יהיה מיידי ולא יצטרך לחכות לתשובת שרת נוספת בכל החלפה
    loadHistory();
    loadFiles();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const boundUpdate = updateContact.bind(null, id);
  const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : "";
  const visibleTabs = TABS.filter((t) => {
    if ((t.key === "history" || t.key === "activity") && hiddenSections.includes("donations")) return false;
    if (t.key === "files" && hiddenSections.includes("files")) return false;
    return true;
  });

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === tab)) setTab("details");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenSections]);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-5xl w-full h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-baseline justify-between px-6 pt-6 mb-4 shrink-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-xl font-bold">
              {loading ? "טוען..." : contact ? contactName : "לא נמצא"}
            </h2>
            {contact?.updated_at && (
              <span className="text-xs italic text-ink-soft">
                עודכן לאחרונה: {new Date(contact.updated_at).toLocaleDateString("he-IL")}
              </span>
            )}
          </div>
          <button
            onClick={requestClose}
            disabled={saving}
            aria-label="סגירה"
            className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-soft px-6">טוען פרטים...</p>
        ) : contact ? (
          <>
            <div className="px-6 shrink-0">
              <TabBar tabs={visibleTabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {tab === "details" && (
                <>
                  {hasRedactions && (
                    <p className="text-xs text-wine bg-wine/5 border border-wine/30 rounded-lg p-2.5 mb-4">
                      חלק מהשדות מוסתרים עבורך לפי הרשאה, ולכן הכרטיס מוצג לצפייה בלבד.
                    </p>
                  )}
                  <ContactForm
                    action={boundUpdate}
                    initial={contact}
                    readOnly={!editable || hasRedactions}
                    onPendingChange={setSaving}
                    onSuccess={onClose}
                    onDirty={() => setDirty(true)}
                  />
                </>
              )}
              {tab === "history" && (
                <ContactHistoryTab
                  rows={historyRows}
                  error={historyError}
                  editable={editable}
                  contactName={contactName}
                  categories={categories}
                  handlers={handlers}
                  onChanged={loadHistory}
                />
              )}
              {tab === "activity" && <ContactActivityTab rows={historyRows} error={historyError} />}
              {tab === "files" && (
                <ContactFilesTab
                  contactId={id}
                  editable={editable}
                  files={files}
                  error={filesError}
                  onChanged={loadFiles}
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-wine px-6">לא נמצא איש קשר</p>
        )}
      </div>
      {confirmClose && (
        <CloseConfirm
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>,
    document.body
  );
}
