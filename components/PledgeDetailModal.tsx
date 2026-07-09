"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import PledgeForm from "./PledgeForm";
import CloseConfirm from "./CloseConfirm";
import DeleteRecordButton from "./DeleteRecordButton";
import { updatePledge } from "@/app/(app)/donations/pledge-actions";
import type { Pledge } from "@/lib/types";

type NamedItem = { id: string; name: string };

export default function PledgeDetailModal({
  pledge,
  contactName,
  categories,
  handlers,
  onClose,
}: {
  pledge: Pledge;
  contactName: string;
  categories: NamedItem[];
  handlers: NamedItem[];
  onClose: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const boundUpdate = updatePledge.bind(null, pledge.id);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-bold">עריכת התחייבות</h2>
          <div className="flex items-center gap-2">
            <DeleteRecordButton table="pledges" id={pledge.id} label="ההתחייבות" onDeleted={onClose} />
            <button
              onClick={requestClose}
              disabled={saving}
              aria-label="סגירה"
              className="text-ink-soft hover:text-ink text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-parchment disabled:opacity-30"
            >
              ×
            </button>
          </div>
        </div>

        <PledgeForm
          action={boundUpdate}
          initial={pledge}
          contactName={contactName}
          onDirty={() => setDirty(true)}
          onPendingChange={setSaving}
          onSuccess={onClose}
          categories={categories}
          handlers={handlers}
        />
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
