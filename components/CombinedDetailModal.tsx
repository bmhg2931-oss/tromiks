"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import PledgeAndPaymentEditForm from "./PledgeAndPaymentEditForm";
import PaymentLoadingAnimation from "./PaymentLoadingAnimation";
import CloseConfirm from "./CloseConfirm";
import { TrashIcon } from "./icons";
import { getDonationPaymentLines, type DonationPaymentLineRow } from "@/app/(app)/donations/actions";
import { softDeleteRecord } from "@/app/(app)/settings/trash/actions";
import type { Pledge, Donation, Contact } from "@/lib/types";

type NamedItem = { id: string; name: string };

export default function CombinedDetailModal({
  pledge,
  donation,
  contact,
  categories,
  handlers,
  defaultCurrency,
  onClose,
}: {
  pledge: Pledge;
  donation: Donation;
  contact: Contact;
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultCurrency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paymentLines, setPaymentLines] = useState<DonationPaymentLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);

  useEffect(() => {
    getDonationPaymentLines(donation.id).then((res) => {
      if (res.ok && res.lines) setPaymentLines(res.lines);
      setLinesLoaded(true);
    });
  }, [donation.id]);

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
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full h-[85vh] overflow-y-auto p-6 flex flex-col">
        <div className="flex items-center justify-between mb-5 shrink-0">
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

        {linesLoaded ? (
          <PledgeAndPaymentEditForm
            pledge={pledge}
            donation={donation}
            paymentLines={paymentLines}
            presetContact={contact}
            onDirty={() => setDirty(true)}
            onPendingChange={setSaving}
            onSuccess={onClose}
            categories={categories}
            handlers={handlers}
            defaultCurrency={defaultCurrency}
          />
        ) : (
          <PaymentLoadingAnimation />
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
