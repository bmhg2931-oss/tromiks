"use client";

import { useState } from "react";
import type { Contact, ContactFieldDef } from "@/lib/types";
import { formatAddressLines } from "@/lib/address";
import ContactDetailPanel from "./ContactDetailPanel";
import ContactActionsMenu from "./ContactActionsMenu";
import AddDonationModal from "./AddDonationModal";
import OpenBalancePill from "./OpenBalancePill";

type NamedItem = { id: string; name: string };

function fieldValue(c: Contact, key: string): string {
  const value = (c as unknown as Record<string, unknown>)[key];
  if (!value) return "—";
  if (key === "updated_at") return new Date(String(value)).toLocaleDateString("he-IL");
  return String(value);
}

function renderFieldCell(c: Contact, key: string, balance: number, defaultCurrency: string) {
  if (key === "open_balance") {
    return <OpenBalancePill balance={balance} currency={defaultCurrency} />;
  }
  if (key === "status") {
    return <span className={`pill ${c.status === "פעיל" ? "pill-active" : "pill-inactive"}`}>{c.status}</span>;
  }
  if (key === "address") {
    const { line1, line2 } = formatAddressLines(c.street, c.house_number, c.city);
    if (!line1 && !line2) return "—";
    return (
      <div className="leading-tight">
        {line1 && <div>{line1}</div>}
        {line2 && <div className="text-ink-soft text-[11px] leading-tight">{line2}</div>}
      </div>
    );
  }
  if (key === "tags") {
    return (
      <div className="flex flex-col items-start gap-0.5">
        {c.tags?.map((t: string) => (
          <span key={t} className="text-[9px] leading-tight px-1.5 py-[1px] rounded-full bg-parchment-deep border border-line text-ink-soft whitespace-nowrap">
            {t}
          </span>
        ))}
      </div>
    );
  }
  return fieldValue(c, key);
}

export default function ContactRow({
  c,
  editable,
  fields = [],
  compact = false,
  balance = 0,
  donationCategories,
  donationHandlers,
  defaultHub,
  defaultCurrency,
}: {
  c: Contact;
  editable: boolean;
  fields?: ContactFieldDef[];
  compact?: boolean;
  balance?: number;
  donationCategories: NamedItem[];
  donationHandlers: NamedItem[];
  defaultHub: string;
  defaultCurrency: string;
}) {
  const [panelMode, setPanelMode] = useState<"closed" | "edit" | "history">("closed");
  const [showAddDonation, setShowAddDonation] = useState(false);
  const isActive = c.status === "פעיל";
  const pad = compact ? "p-1.5" : "p-2.5";

  return (
    <>
      <tr
        onClick={() => setPanelMode("edit")}
        className={`border-b border-[#e6e3da] hover:bg-parchment/50 cursor-pointer transition ${!isActive ? "opacity-55" : ""}`}
      >
        <td className={`${pad} font-semibold whitespace-nowrap`}>
          {c.first_name} {c.last_name}
        </td>
        <td className={`${pad} whitespace-nowrap`}>{c.phone || "—"}</td>
        {fields.map((f) => (
          <td key={f.key} className={`${pad} whitespace-nowrap`}>
            {renderFieldCell(c, f.key, balance, defaultCurrency)}
          </td>
        ))}
        <td className={`${pad} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
          <ContactActionsMenu
            contactId={c.id}
            contactName={`${c.first_name} ${c.last_name}`}
            phone={c.phone}
            editable={editable}
            onEdit={() => setPanelMode("edit")}
            onHistory={() => setPanelMode("history")}
            onAddDonation={() => setShowAddDonation(true)}
          />
        </td>
      </tr>
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
