"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PledgeForm from "./PledgeForm";
import DonationForm from "./DonationForm";
import CloseConfirm from "./CloseConfirm";
import { TrashIcon } from "./icons";
import { updatePledge } from "@/app/(app)/donations/pledge-actions";
import { updateDonation } from "@/app/(app)/donations/actions";
import { softDeleteRecord } from "@/app/(app)/settings/trash/actions";
import type { Pledge, Donation } from "@/lib/types";

type NamedItem = { id: string; name: string };

export default function CombinedDetailModal({
  pledge,
  donation,
  contactName,
  categories,
  handlers,
  onClose,
}: {
  pledge: Pledge;
  donation: Donation;
  contactName: string;
  categories: NamedItem[];
  handlers: NamedItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmClose, setConfirmClose] = useState(false);
  const [pledgeSaving, setPledgeSaving] = useState(false);
  const [donationSaving, setDonationSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saving = pledgeSaving || donationSaving;

  const boundUpdatePledge = updatePledge.bind(null, pledge.id);
  const boundUpdateDonation = updateDonation.bind(null, donation.id);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function handleDeleteBoth() {
    if (!confirm('למחוק את ההתחייבות והתשלום המשולבים? ניתן לשחזר בכל עת מתוך הגדרות > פריטים שנמחקו.')) return;
    setDeleting(true);
    const [pledgeResult, donationResult] = await Promise.all([
      softDeleteRecord("pledges", pledge.id),
      softDeleteRecord("donations", donation.id),
    ]);
    setDeleting(false);
    if (!pledgeResult.ok || !donationResult.ok) {
      alert(pledgeResult.error ?? donationResult.error ?? "שגיאה במחיקה");
      return;
    }
    router.refresh();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-bold">עריכת התחייבות ותשלום</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDeleteBoth}
              disabled={deleting}
              className="flex items-center gap-1.5 text-xs text-wine border border-wine/40 rounded-full px-3 py-1.5 hover:bg-wine hover:text-white transition disabled:opacity-50"
            >
              <TrashIcon />
              {deleting ? "מוחק..." : "מחיקה"}
            </button>
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

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-brass-deep mb-3">ההתחייבות</h3>
            <PledgeForm
              action={boundUpdatePledge}
              initial={pledge}
              contactName={contactName}
              onDirty={() => setDirty(true)}
              onPendingChange={setPledgeSaving}
              onSuccess={onClose}
              categories={categories}
              handlers={handlers}
            />
          </div>

          <div className="border-t border-line pt-6">
            <h3 className="text-sm font-semibold text-brass-deep mb-3">התשלום</h3>
            <DonationForm
              action={boundUpdateDonation}
              initial={donation}
              contactName={contactName}
              onDirty={() => setDirty(true)}
              onPendingChange={setDonationSaving}
              onSuccess={onClose}
              categories={categories}
            />
          </div>
        </div>
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
