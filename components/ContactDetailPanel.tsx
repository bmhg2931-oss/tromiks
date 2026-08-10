"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import ContactForm from "./ContactForm";
import ContactDetailsView from "./ContactDetailsView";
import ContactHebrewDatesSection from "./ContactHebrewDatesSection";
import CloseConfirm from "./CloseConfirm";
import TabBar from "./TabBar";
import ContactHistoryTab from "./ContactHistoryTab";
import ContactActivityTab from "./ContactActivityTab";
import ContactFilesTab from "./ContactFilesTab";
import ContactReportModal from "./ContactReportModal";
import { updateContact } from "@/app/(app)/contacts/actions";
import { fetchContactForView } from "@/app/(app)/contacts/view-actions";
import { logContactView } from "@/app/(app)/contacts/activity-log-actions";
import { fetchContactHistory, type ContactHistoryRow } from "@/app/(app)/contacts/history-actions";
import { listContactFiles, type ContactFileRow } from "@/app/(app)/contacts/files-actions";
import type { Contact } from "@/lib/types";

type TabKey = "details" | "activity_center" | "history" | "campaigns" | "activity" | "files" | "invoice";
type NamedItem = { id: string; name: string };

// אנימציית טעינה - סילואטת איש קשר "נושמת" עם נקודות מקפצות, במקום טקסט "טוען..." יבש
function ContactLoadingAnimation() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 text-ink-soft -translate-y-[76px]">
      <svg
        width="168"
        height="168"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-pulse text-brass"
      >
        <circle cx="8" cy="5.4" r="2.8" />
        <path d="M2.5 14c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" />
      </svg>
      <div className="flex gap-2.5">
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce [animation-delay:-0.3s]" />
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce [animation-delay:-0.15s]" />
        <span className="w-4 h-4 rounded-full bg-brass animate-bounce" />
      </div>
    </div>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "פרטי איש קשר" },
  { key: "activity_center", label: "מרכז פעילות" },
  { key: "activity", label: "יומן פעילות" },
  { key: "history", label: "היסטוריית תרומות" },
  { key: "campaigns", label: "היסטוריית קמפיינים" },
  { key: "files", label: "קבצים" },
  { key: "invoice", label: "חשבונית" },
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
  const [defaultHub, setDefaultHub] = useState("ישראל");
  const [defaultCurrency, setDefaultCurrency] = useState("₪");
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
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  async function loadContact() {
    const viewRes = await fetchContactForView(id);
    setContact(viewRes.ok ? viewRes.contact ?? null : null);
    setHasRedactions(Boolean(viewRes.hasRedactions));
    setHiddenSections(viewRes.hiddenSections ?? []);
    return viewRes;
  }

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
    setIsEditingDetails(false);
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [viewRes, { data: cats }, { data: hands }, { data: profile }] = await Promise.all([
        fetchContactForView(id),
        supabase.from("donation_categories").select("id, name").is("deleted_at", null).order("sort_order"),
        supabase.from("donation_handlers").select("id, name").is("deleted_at", null).order("sort_order"),
        user
          ? supabase.from("profiles").select("default_payment_hub, default_currency").eq("id", user.id).single()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setContact(viewRes.ok ? viewRes.contact ?? null : null);
      setHasRedactions(Boolean(viewRes.hasRedactions));
      setHiddenSections(viewRes.hiddenSections ?? []);
      setCategories(cats ?? []);
      setHandlers(hands ?? []);
      if (profile?.default_payment_hub) setDefaultHub(profile.default_payment_hub);
      if (profile?.default_currency) setDefaultCurrency(profile.default_currency);
      setLoading(false);
      if (viewRes.ok && viewRes.contact) void logContactView(id);
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
    if ((t.key === "history" || t.key === "campaigns" || t.key === "activity" || t.key === "invoice") && hiddenSections.includes("donations"))
      return false;
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
            <h2 className="font-serif text-xl font-bold">{loading ? "" : contact ? contactName : "לא נמצא"}</h2>
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
          <ContactLoadingAnimation />
        ) : contact ? (
          <>
            <div className="px-6 shrink-0">
              <TabBar tabs={visibleTabs} active={tab} onChange={(k) => setTab(k as TabKey)} />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {tab === "details" && (
                <div className="space-y-6">
                  {hasRedactions && (
                    <p className="text-xs text-wine bg-wine/5 border border-wine/30 rounded-lg p-2.5 mb-4">
                      חלק מהשדות מוסתרים עבורך לפי הרשאה, ולכן הכרטיס מוצג לצפייה בלבד.
                    </p>
                  )}
                  {isEditingDetails && editable && !hasRedactions ? (
                    <ContactForm
                      action={boundUpdate}
                      initial={contact}
                      readOnly={false}
                      onPendingChange={setSaving}
                      onSuccess={async () => {
                        await loadContact();
                        setDirty(false);
                        setIsEditingDetails(false);
                      }}
                      onDirty={() => setDirty(true)}
                    />
                  ) : (
                    <ContactDetailsView contact={contact} editable={editable && !hasRedactions} onEdit={() => setIsEditingDetails(true)} />
                  )}
                  <ContactHebrewDatesSection contactId={id} editable={editable && !hasRedactions} />
                </div>
              )}
              {tab === "activity_center" && (
                <p className="text-sm text-ink-soft">
                  התוכן של הטאב הזה יתווסף עם בניית מרכז הפעילות - כאן יוצג מרכז הפעילות (גביה, תאריכון, הודעות) ממוקד לאיש הקשר הזה בלבד.
                </p>
              )}
              {tab === "history" && (
                <ContactHistoryTab
                  rows={historyRows}
                  error={historyError}
                  editable={editable}
                  contact={contact}
                  categories={categories}
                  handlers={handlers}
                  defaultCurrency={defaultCurrency}
                  onChanged={loadHistory}
                />
              )}
              {tab === "campaigns" && (
                <ContactHistoryTab
                  rows={historyRows ? historyRows.filter((r) => r.donation?.campaign_id || r.pledge?.campaign_id) : null}
                  error={historyError}
                  editable={editable}
                  contact={contact}
                  categories={categories}
                  handlers={handlers}
                  defaultCurrency={defaultCurrency}
                  onChanged={loadHistory}
                />
              )}
              {tab === "activity" && (
                <ContactActivityTab
                  rows={historyRows}
                  error={historyError}
                  contact={contact}
                  categories={categories}
                  handlers={handlers}
                  defaultHub={defaultHub}
                  defaultCurrency={defaultCurrency}
                  editable={editable}
                  onChanged={loadHistory}
                />
              )}
              {tab === "files" && (
                <ContactFilesTab
                  contactId={id}
                  editable={editable}
                  files={files}
                  error={filesError}
                  onChanged={loadFiles}
                />
              )}
              {tab === "invoice" && <ContactReportModal inline contactId={id} contactName={contactName} title="חשבונית" />}
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
