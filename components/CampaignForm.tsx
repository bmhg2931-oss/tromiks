"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import Field from "./FormField";
import SaveButton from "./SaveButton";
import type { CampaignFormResult } from "@/app/(app)/campaigns/actions";
import { CAMPAIGN_STATUSES, CAMPAIGN_TAB_OPTIONS, CURRENCIES, EXTRA_CURRENCIES, type Campaign } from "@/lib/types";

export default function CampaignForm({
  action,
  initial,
  parentCampaignId,
  parentName,
  onDirty,
  onPendingChange,
  onSuccess,
}: {
  action: (prevState: CampaignFormResult | null, formData: FormData) => Promise<CampaignFormResult>;
  initial?: Partial<Campaign>;
  parentCampaignId?: string;
  parentName?: string;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
}) {
  const [state, formAction] = useFormState(action, null);
  const [goalCurrency, setGoalCurrency] = useState(initial?.goal_currency || "₪");
  const [enabledTabs, setEnabledTabs] = useState<string[]>(initial?.enabled_tabs ?? [...CAMPAIGN_TAB_OPTIONS]);

  function toggleTab(tab: string) {
    setEnabledTabs((prev) => (prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]));
  }

  useEffect(() => {
    if (state?.ok) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} onChange={() => onDirty()} className="space-y-4">
      {parentName && (
        <p className="text-xs text-ink-soft">
          תת-קמפיין של <span className="font-semibold text-ink">{parentName}</span>
        </p>
      )}
      {parentCampaignId && <input type="hidden" name="parent_campaign_id" value={parentCampaignId} />}

      <Field label="שם הקמפיין *">
        <input name="name" required defaultValue={initial?.name} className="in" autoFocus />
      </Field>

      <Field label="תיאור">
        <textarea name="description" defaultValue={initial?.description ?? ""} className="in min-h-[60px]" />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="יעד כספי (אופציונלי)">
          <input
            type="number"
            name="goal_amount"
            min="1"
            step="0.01"
            defaultValue={initial?.goal_amount ?? ""}
            placeholder="ללא יעד"
            className="in"
          />
        </Field>
        <select name="goal_currency" value={goalCurrency} onChange={(e) => setGoalCurrency(e.target.value)} className="in w-20">
          {[...CURRENCIES, ...EXTRA_CURRENCIES].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך התחלה">
          <input type="date" name="start_date" defaultValue={initial?.start_date ?? ""} className="in" />
        </Field>
        <Field label="תאריך סיום (ריק = מתמשך)">
          <input type="date" name="end_date" defaultValue={initial?.end_date ?? ""} className="in" />
        </Field>
      </div>

      <Field label="סטטוס">
        <select name="status" defaultValue={initial?.status ?? "פעיל"} className="in">
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>

      <Field label="טאבים פעילים בקמפיין">
        <div className="flex flex-wrap gap-3">
          {CAMPAIGN_TAB_OPTIONS.map((tab) => (
            <label key={tab} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={enabledTabs.includes(tab)} onChange={() => toggleTab(tab)} />
              {tab}
            </label>
          ))}
        </div>
        <input type="hidden" name="enabled_tabs" value={enabledTabs.join(",")} />
      </Field>

      {state?.error && <p className="text-sm text-wine text-center">{state.error}</p>}

      <div className="flex justify-center pt-2">
        <SaveButton onPendingChange={onPendingChange} />
      </div>
    </form>
  );
}
