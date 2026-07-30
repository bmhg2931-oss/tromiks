"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useFormStatus } from "react-dom";
import { createCreditDonation } from "@/app/(app)/donations/actions";

function CreditSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-6 py-2.5 text-sm transition disabled:opacity-70"
    >
      {pending ? "יוצר..." : "יצירת זיכוי"}
    </button>
  );
}

const CREDIT_CURRENCIES = ["₪", "$", "€", "£", "CHF"];

export default function CreateCreditModal({
  contactId,
  onClose,
  onCreated,
}: {
  contactId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [state, formAction] = useFormState(createCreditDonation, null);
  const [currency, setCurrency] = useState("₪");

  useEffect(() => {
    if (state?.ok) onCreated();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold">יצירת זיכוי</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">
            ×
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="contact_id" value={contactId} />
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">סכום הזיכוי</label>
            <div className="flex gap-2">
              <input name="amount" type="number" step="0.01" min="0.01" required className="in flex-1" />
              <div className="flex gap-1">
                {CREDIT_CURRENCIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`w-9 h-9 rounded-lg border text-sm font-semibold ${
                      currency === c ? "bg-brass text-white border-brass" : "border-line hover:bg-parchment"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input type="hidden" name="currency" value={currency} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">סיבת הזיכוי (אופציונלי)</label>
            <textarea name="notes" className="in min-h-[60px]" placeholder="למשל: זיכוי בגין ביטול/טעות בגבייה" />
          </div>

          {state && !state.ok && <p className="text-sm text-wine">{state.error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-line text-sm hover:bg-parchment">
              ביטול
            </button>
            <CreditSubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
