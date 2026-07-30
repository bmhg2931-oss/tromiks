"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";

export default function SaveButton({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-8 py-2.5 text-sm transition disabled:opacity-70"
    >
      {pending ? "שומר..." : "שמירה"}
    </button>
  );
}
