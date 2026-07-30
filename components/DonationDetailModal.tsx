"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DonationForm from "./DonationForm";
import PaymentLoadingAnimation from "./PaymentLoadingAnimation";
import CloseConfirm from "./CloseConfirm";
import DeleteRecordButton from "./DeleteRecordButton";
import { updateDonation, getDonationPaymentLines, type DonationPaymentLineRow } from "@/app/(app)/donations/actions";
import type { Donation, Contact } from "@/lib/types";

type NamedItem = { id: string; name: string };

export default function DonationDetailModal({
  donation,
  contact,
  categories,
  onClose,
}: {
  donation: Donation;
  contact: Contact;
  categories: NamedItem[];
  onClose: () => void;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paymentLines, setPaymentLines] = useState<DonationPaymentLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);

  useEffect(() => {
    getDonationPaymentLines(donation.id).then((res) => {
      if (res.ok && res.lines) setPaymentLines(res.lines);
      setLinesLoaded(true);
    });
  }, [donation.id]);

  const boundUpdate = updateDonation.bind(null, donation.id);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-2xl w-full h-[85vh] overflow-y-auto p-6 flex flex-col">
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="font-serif text-xl font-bold">עריכת תשלום</h2>
          <div className="flex items-center gap-2">
            <DeleteRecordButton table="donations" id={donation.id} label="התשלום" onDeleted={onClose} />
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
          <DonationForm
            action={boundUpdate}
            initial={donation}
            presetContact={contact}
            onDirty={() => setDirty(true)}
            onPendingChange={setSaving}
            onSuccess={onClose}
            categories={categories}
            paymentLines={paymentLines}
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
