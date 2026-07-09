"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import CampaignForm from "./CampaignForm";
import CloseConfirm from "./CloseConfirm";
import { createCampaign } from "@/app/(app)/campaigns/actions";

export default function NewCampaignModal({
  label = "קמפיין חדש",
  parentCampaignId,
  parentName,
}: {
  label?: string;
  parentCampaignId?: string;
  parentName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function closeModal() {
    setOpen(false);
    setDirty(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 h-9 text-sm transition shrink-0"
      >
        + {label}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-xl font-bold">{parentCampaignId ? "תת-קמפיין חדש" : "קמפיין חדש"}</h2>
                <button
                  onClick={() => {
                    if (saving) return;
                    if (dirty) setConfirmClose(true);
                    else closeModal();
                  }}
                  disabled={saving}
                  aria-label="סגירה"
                  className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment disabled:opacity-30"
                >
                  ×
                </button>
              </div>
              <CampaignForm
                action={createCampaign}
                parentCampaignId={parentCampaignId}
                parentName={parentName}
                onPendingChange={setSaving}
                onSuccess={closeModal}
                onDirty={() => setDirty(true)}
              />
            </div>
            {confirmClose && (
              <CloseConfirm
                onConfirm={() => {
                  setConfirmClose(false);
                  closeModal();
                }}
                onCancel={() => setConfirmClose(false)}
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
}
