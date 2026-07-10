"use client";

import { useState } from "react";
import PledgeForm from "./PledgeForm";
import PledgeAndPaymentForm from "./PledgeAndPaymentForm";
import PaymentOnlyForm from "./PaymentOnlyForm";
import CloseConfirm from "./CloseConfirm";
import { createPledge } from "@/app/(app)/donations/pledge-actions";
import type { Contact } from "@/lib/types";

type Flow = "choose" | "pledge-only" | "pledge-and-payment" | "payment-only";
type NamedItem = { id: string; name: string };

const FLOW_TITLES: Record<Flow, string> = {
  choose: "הוספת תרומה",
  "pledge-only": "התחייבות בלבד",
  "pledge-and-payment": "התחייבות ותשלום",
  "payment-only": "תשלום בלבד",
};

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

function ChoiceButton({ onClick, title, desc }: { onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-right border border-line rounded-xl p-4 hover:bg-parchment hover:border-brass/50 transition"
    >
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-xs text-ink-soft mt-1">{desc}</div>
    </button>
  );
}

export default function AddDonationModal({
  categories,
  handlers,
  defaultHub,
  defaultCurrency,
  defaultCategory,
  presetContact,
  open: controlledOpen,
  onOpenChange,
}: {
  categories: NamedItem[];
  handlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
  defaultCategory?: string;
  presetContact?: Contact;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setUncontrolledOpen(v);
  };

  const [flow, setFlow] = useState<Flow>("choose");
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function closeModal() {
    setOpen(false);
    setFlow("choose");
    setDirty(false);
  }

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else closeModal();
  }

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setOpen(true)}
          className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-lg px-4 py-2 text-sm transition"
        >
          + תרומה חדשה
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {flow !== "choose" && (
                  <button
                    onClick={() => setFlow("choose")}
                    aria-label="חזרה"
                    className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center hover:bg-ink/85 transition"
                  >
                    <BackArrowIcon />
                  </button>
                )}
                <h2 className="font-serif text-xl font-bold">{presetContact ? "הוספת תרומה" : FLOW_TITLES[flow]}</h2>
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

            {presetContact && (
              <p className="text-center font-serif text-2xl font-bold mb-5">
                {presetContact.first_name} {presetContact.last_name}
              </p>
            )}

            {flow === "choose" && (
              <div className="space-y-3">
                <ChoiceButton
                  onClick={() => setFlow("pledge-only")}
                  title="התחייבות נדרים ונדבות"
                  desc="רישום התחייבות לתרומה, ללא תשלום כרגע"
                />
                <ChoiceButton
                  onClick={() => setFlow("pledge-and-payment")}
                  title="התחייבות ותשלום נדרים ונדבות"
                  desc="רישום התחייבות יחד עם תשלום מיידי"
                />
                <ChoiceButton
                  onClick={() => setFlow("payment-only")}
                  title="תשלום נדרים ונדבות"
                  desc="תשלום כללי, או תשלום כנגד התחייבות קיימת"
                />
              </div>
            )}

            {flow === "pledge-only" && (
              <PledgeForm
                action={createPledge}
                onDirty={() => setDirty(true)}
                onPendingChange={setSaving}
                onSuccess={closeModal}
                categories={categories}
                handlers={handlers}
                defaultCurrency={defaultCurrency}
                defaultCategory={defaultCategory}
                presetContact={presetContact}
              />
            )}

            {flow === "pledge-and-payment" && (
              <PledgeAndPaymentForm
                onDirty={() => setDirty(true)}
                onPendingChange={setSaving}
                onSuccess={closeModal}
                categories={categories}
                handlers={handlers}
                defaultHub={defaultHub}
                defaultCurrency={defaultCurrency}
                defaultCategory={defaultCategory}
                presetContact={presetContact}
              />
            )}

            {flow === "payment-only" && (
              <PaymentOnlyForm
                onDirty={() => setDirty(true)}
                onPendingChange={setSaving}
                onSuccess={closeModal}
                categories={categories}
                defaultHub={defaultHub}
                defaultCurrency={defaultCurrency}
                defaultCategory={defaultCategory}
                presetContact={presetContact}
              />
            )}
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
        </div>
      )}
    </>
  );
}
