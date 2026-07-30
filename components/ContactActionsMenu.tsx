"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { softDeleteContact } from "@/app/(app)/contacts/actions";
import { PencilIcon, EyeIcon, CallIcon, TrashIcon, DonationPlusIcon, HistoryIcon, DotsVerticalIcon } from "./icons";

function normalizePhoneForDialing(raw: string): string {
  const stripped = raw.replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) return "00" + stripped.slice(1);
  if (stripped.startsWith("00")) return stripped;
  if (!stripped.startsWith("0")) return "0" + stripped;
  return stripped;
}

function MenuIconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center hover:bg-parchment transition [&>svg]:w-6 [&>svg]:h-6 ${className}`}
    >
      {children}
    </button>
  );
}

export default function ContactActionsMenu({
  contactId,
  contactName,
  phone,
  editable,
  onEdit,
  onHistory,
  onAddDonation,
}: {
  contactId: string;
  contactName: string;
  phone: string;
  editable: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onAddDonation: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  async function handleDelete() {
    setDeleting(true);
    await softDeleteContact(contactId);
    setDeleting(false);
    setConfirmDelete(false);
    router.refresh();
  }

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="פעולות נוספות"
        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft bg-white shadow-[0_1px_5px_rgba(0,0,0,0.16)] hover:bg-parchment hover:text-ink transition"
      >
        <DotsVerticalIcon />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 flex items-center gap-0.5 bg-white border border-line/60 rounded-full shadow-xl p-1">
          <MenuIconButton
            label={editable ? "עריכה" : "צפייה"}
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            {editable ? <PencilIcon /> : <EyeIcon />}
          </MenuIconButton>
          {phone && (
            <MenuIconButton
              label="שיחת טלפון"
              onClick={() => {
                setOpen(false);
                window.location.href = `tel:${normalizePhoneForDialing(phone)}`;
              }}
            >
              <CallIcon />
            </MenuIconButton>
          )}
          <MenuIconButton
            label="הוספת תרומה"
            onClick={() => {
              setOpen(false);
              onAddDonation();
            }}
          >
            <DonationPlusIcon />
          </MenuIconButton>
          <MenuIconButton
            label="הסטוריית לקוח"
            onClick={() => {
              setOpen(false);
              onHistory();
            }}
          >
            <HistoryIcon />
          </MenuIconButton>
          <MenuIconButton
            label="מחיקת איש קשר"
            className="text-wine hover:bg-wine/10"
            onClick={() => {
              setOpen(false);
              setConfirmDelete(true);
            }}
          >
            <TrashIcon />
          </MenuIconButton>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-line/60 max-w-sm w-full p-6">
            <h3 className="font-serif text-lg font-bold mb-2">מחיקת איש קשר</h3>
            <p className="text-sm text-ink-soft mb-5">
              האם למחוק את {contactName}? ניתן לשחזר בכל עת דרך הגדרות &gt; אנשי קשר שנמחקו.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-full border border-line hover:bg-parchment transition disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-full bg-wine text-white hover:bg-wine/90 transition disabled:opacity-50"
              >
                {deleting ? "מוחק..." : "מחיקה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
