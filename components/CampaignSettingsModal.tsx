"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { DEPARTMENTS } from "@/lib/types";
import {
  updateCampaignDepartments,
  updateCampaignContactIds,
  updateCampaignTemplates,
  importCampaignMapping,
} from "@/app/(app)/campaigns/settings-actions";
import CampaignAudiencePickerModal, { type PickerContact } from "./CampaignAudiencePickerModal";
import CampaignDimensionsManager, { type DimensionWithLevels } from "./CampaignDimensionsManager";

const GEAR_TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="5.1" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
      {GEAR_TEETH_ANGLES.map((angle) => (
        <rect key={angle} x="8.9" y="1.2" width="2.2" height="2.6" rx="0.6" fill="currentColor" stroke="none" transform={`rotate(${angle} 10 10)`} />
      ))}
    </svg>
  );
}

type MappingActionFn = (arg1: string, arg2?: string) => Promise<{ ok: boolean; error?: string }>;

export default function CampaignSettingsModal({
  campaignId,
  initialAudienceMode,
  initialDepartments,
  initialContactIds,
  allContacts,
  otherCampaigns,
  dimensions,
  initialEmailTemplate,
  initialFaxTemplate,
  boundCreateDimension,
  boundDeleteDimension,
  boundAddLevel,
  boundDeleteLevel,
}: {
  campaignId: string;
  initialAudienceMode: "department" | "manual";
  initialDepartments: string[];
  initialContactIds: string[];
  allContacts: PickerContact[];
  otherCampaigns: { id: string; name: string }[];
  dimensions: DimensionWithLevels[];
  initialEmailTemplate: string;
  initialFaxTemplate: string;
  boundCreateDimension: (name: string) => Promise<{ ok: boolean; error?: string }>;
  boundDeleteDimension: MappingActionFn;
  boundAddLevel: (dimensionId: string, label: string) => Promise<{ ok: boolean; error?: string }>;
  boundDeleteLevel: MappingActionFn;
}) {
  const [open, setOpen] = useState(false);
  const [audienceMode, setAudienceMode] = useState(initialAudienceMode);
  const [departments, setDepartments] = useState<string[]>(initialDepartments);
  const [contactIds, setContactIds] = useState<string[]>(initialContactIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceCampaignId, setSourceCampaignId] = useState("");
  const [emailTemplate, setEmailTemplate] = useState(initialEmailTemplate);
  const [faxTemplate, setFaxTemplate] = useState(initialFaxTemplate);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function toggleDepartment(dep: string) {
    setDepartments((prev) => (prev.includes(dep) ? prev.filter((d) => d !== dep) : [...prev, dep]));
  }

  function handleSaveDepartments() {
    setMessage(null);
    setAudienceMode("department");
    startTransition(async () => {
      const result = await updateCampaignDepartments(campaignId, departments);
      setMessage(result.ok ? "נשמר" : result.error ?? "שגיאה בשמירה");
    });
  }

  function handleConfirmContactIds(ids: string[]) {
    setContactIds(ids);
    setPickerOpen(false);
    setMessage(null);
    setAudienceMode("manual");
    startTransition(async () => {
      const result = await updateCampaignContactIds(campaignId, ids);
      setMessage(result.ok ? "נשמר" : result.error ?? "שגיאה בשמירה");
    });
  }

  function handleSaveTemplates() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateCampaignTemplates(campaignId, emailTemplate, faxTemplate);
      setMessage(result.ok ? "נשמר" : result.error ?? "שגיאה בשמירה");
    });
  }

  function handleImport() {
    if (!sourceCampaignId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await importCampaignMapping(campaignId, sourceCampaignId);
      setMessage(result.ok ? "יובא בהצלחה" : result.error ?? "שגיאה בייבוא");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-line rounded-full px-3 h-9 text-sm hover:bg-parchment transition shrink-0"
      >
        הגדרות קמפיין
        <GearIcon />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <div
              className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-md w-full max-h-[85vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-lg font-bold">הגדרות קמפיין</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="סגירה"
                  className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment"
                >
                  ×
                </button>
              </div>

              {message && <p className="text-xs text-sage mb-3">{message}</p>}

              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">קהל היעד של הקמפיין</h3>
                <div className="flex border border-line rounded-lg overflow-hidden text-xs mb-3">
                  <button
                    type="button"
                    onClick={() => setAudienceMode("department")}
                    className={`flex-1 px-2.5 py-1.5 transition ${audienceMode === "department" ? "bg-brass text-white font-semibold" : "hover:bg-parchment"}`}
                  >
                    לפי מחלקה
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudienceMode("manual")}
                    className={`flex-1 px-2.5 py-1.5 border-r border-line transition ${audienceMode === "manual" ? "bg-brass text-white font-semibold" : "hover:bg-parchment"}`}
                  >
                    בחירה ידנית
                  </button>
                </div>

                {audienceMode === "department" ? (
                  <>
                    <p className="text-xs text-ink-soft mb-2">ללא בחירה - כל המחלקות כלולות.</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {DEPARTMENTS.map((dep) => (
                        <label key={dep} className="flex items-center gap-1.5 text-sm border border-line rounded-full px-2.5 py-1">
                          <input type="checkbox" checked={departments.includes(dep)} onChange={() => toggleDepartment(dep)} />
                          {dep}
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveDepartments}
                      disabled={pending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brass hover:bg-brass-deep text-white transition disabled:opacity-60"
                    >
                      שמירת מחלקות
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-ink-soft mb-2">{contactIds.length} אנשי קשר נבחרו ידנית.</p>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brass hover:bg-brass-deep text-white transition"
                    >
                      בחירת אנשי קשר...
                    </button>
                  </>
                )}
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">ממדי דירוג למיפוי</h3>
                <CampaignDimensionsManager
                  dimensions={dimensions}
                  onAddDimension={boundCreateDimension}
                  onDeleteDimension={boundDeleteDimension}
                  onAddLevel={boundAddLevel}
                  onDeleteLevel={boundDeleteLevel}
                />
              </div>

              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">תבניות הודעה</h3>
                <p className="text-xs text-ink-soft mb-2">
                  ניתן להשתמש ב-{"{שם}"} ו-{"{קמפיין}"} כתחליפים אוטומטיים בטקסט.
                </p>
                <label className="block text-xs font-semibold text-ink-soft mb-1">תבנית הודעת דוא&quot;ל</label>
                <textarea value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} className="in min-h-[60px] mb-3" />
                <label className="block text-xs font-semibold text-ink-soft mb-1">תבנית הודעת פקס</label>
                <textarea value={faxTemplate} onChange={(e) => setFaxTemplate(e.target.value)} className="in min-h-[60px] mb-3" />
                <button
                  type="button"
                  onClick={handleSaveTemplates}
                  disabled={pending}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brass hover:bg-brass-deep text-white transition disabled:opacity-60"
                >
                  שמירת תבניות
                </button>
              </div>

              <div>
                <h3 className="font-semibold text-sm mb-2">ייבוא נתוני מיפוי מקמפיין אחר</h3>
                <p className="text-xs text-ink-soft mb-2">מעתיק ממדי דירוג, דרגות, ומיפויי אנשי קשר (יעד/פוטנציאל/דירוגים) מקמפיין קיים לתוך הקמפיין הזה.</p>
                <div className="flex items-center gap-2">
                  <select value={sourceCampaignId} onChange={(e) => setSourceCampaignId(e.target.value)} className="in flex-1">
                    <option value="">בחר קמפיין מקור...</option>
                    {otherCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={pending || !sourceCampaignId}
                    className="text-xs px-3 py-1.5 rounded-lg bg-brass hover:bg-brass-deep text-white transition disabled:opacity-40 shrink-0"
                  >
                    ייבוא
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {pickerOpen && (
        <CampaignAudiencePickerModal
          contacts={allContacts}
          initialSelectedIds={contactIds}
          onConfirm={handleConfirmContactIds}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
