"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteUserAccount } from "@/app/(app)/settings/users/actions";
import { TrashIcon } from "./icons";

export default function DeleteUserButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`למחוק לצמיתות את המשתמש "${name}"? הפעולה בלתי הפיכה ואי אפשר לשחזר אותה.`)) return;
    setDeleting(true);
    const result = await deleteUserAccount(userId);
    setDeleting(false);
    if (!result.ok) {
      alert(result.error ?? "שגיאה במחיקת המשתמש");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="מחיקת משתמש"
      title="מחיקת משתמש"
      className="w-8 h-8 rounded-full flex items-center justify-center text-wine hover:bg-wine/10 transition disabled:opacity-50"
    >
      <TrashIcon />
    </button>
  );
}
