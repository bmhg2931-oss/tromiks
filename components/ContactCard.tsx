"use client";

import { useState } from "react";
import type { Contact, ContactFieldDef } from "@/lib/types";
import { formatAddressLines } from "@/lib/address";
import ContactDetailPanel from "./ContactDetailPanel";
import ContactActionsMenu from "./ContactActionsMenu";
import AddDonationModal from "./AddDonationModal";
import OpenBalancePill from "./OpenBalancePill";

type NamedItem = { id: string; name: string };

function fieldValue(c: Contact, key: string): string | null {
  if (key === "address") {
    const { line1, line2 } = formatAddressLines(c.street, c.house_number, c.city);
    return [line1, line2].filter(Boolean).join(", ") || null;
  }
  const value = (c as unknown as Record<string, unknown>)[key];
  if (!value) return null;
  if (key === "updated_at") return new Date(String(value)).toLocaleDateString("he-IL");
  return String(value);
}

export default function ContactCard({
  c,
  editable,
  fields = [],
  balance = 0,
  donationCategories,
  donationHandlers,
  defaultHub,
  defaultCurrency,
}: {
  c: Contact;
  editable: boolean;
  fields?: ContactFieldDef[];
  balance?: number;
  donationCategories: NamedItem[];
  donationHandlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
}) {
  const [panelMode, setPanelMode] = useState<"closed" | "edit" | "history">("closed");
  const [showAddDonation, setShowAddDonation] = useState(false);
  const isActive = c.status === "פעיל";
  const hasField = (key: string) => fields.some((f) => f.key === key);
  const extraFields = fields.filter((f) => !["department", "status", "email", "tags"].includes(f.key));

  return (
    <>
      <div
        onClick={() => setPanelMode("edit")}
        className={`bg-white border border-line rounded-xl shadow p-5 hover:bg-parchment/30 hover:border-brass/50 transition cursor-pointer ${
          !isActive ? "opacity-55" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-parchment-deep border border-line flex items-center justify-center font-serif font-bold text-brass-deep">
              {c.first_name?.[0]}
              {c.last_name?.[0]}
            </div>
            <div>
              <div className="font-bold text-[15.5px]">
                {c.first_name} {c.last_name}
              </div>
              {hasField("department") && c.department && <div className="text-xs text-ink-soft">{c.department}</div>}
            </div>
          </div>
          {hasField("status") && <span className={`pill ${isActive ? "pill-active" : "pill-inactive"}`}>{c.status}</span>}
        </div>
        <div className="mt-3 text-[13px] text-ink-soft leading-8">
          {c.phone && <div>📞 {c.phone}</div>}
          {hasField("email") && c.email && <div>✉️ {c.email}</div>}
          {extraFields.map((f) => {
            if (f.key === "open_balance") {
              return (
                <div key={f.key}>
                  {f.label}: <OpenBalancePill balance={balance} currency={defaultCurrency} />
                </div>
              );
            }
            const val = fieldValue(c, f.key);
            if (!val) return null;
            return (
              <div key={f.key}>
                {f.label}: {val}
              </div>
            );
          })}
        </div>
        {hasField("tags") && c.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-0.5">
            {c.tags.map((t: string) => (
              <span key={t} className="text-[9px] leading-tight px-1.5 py-[1px] rounded-full bg-parchment-deep border border-line text-ink-soft">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <ContactActionsMenu
            contactId={c.id}
            contactName={`${c.first_name} ${c.last_name}`}
            phone={c.phone}
            editable={editable}
            onEdit={() => setPanelMode("edit")}
            onHistory={() => setPanelMode("history")}
            onAddDonation={() => setShowAddDonation(true)}
          />
        </div>
      </div>
      {panelMode !== "closed" && (
        <ContactDetailPanel
          id={c.id}
          editable={editable}
          initialTab={panelMode === "history" ? "history" : "details"}
          onClose={() => setPanelMode("closed")}
        />
      )}
      {showAddDonation && (
        <AddDonationModal
          open={showAddDonation}
          onOpenChange={setShowAddDonation}
          presetContact={c}
          categories={donationCategories}
          handlers={donationHandlers}
          defaultHub={defaultHub}
          defaultCurrency={defaultCurrency}
        />
      )}
    </>
  );
}
