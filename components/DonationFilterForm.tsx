"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DonationFilterForm({ q: initialQ, status: initialStatus }: { q?: string; status?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ || "");
  const [status, setStatus] = useState(initialStatus || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(nextQ: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    router.push(`/donations?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams(q, status), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setStatus(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pushParams(q, next);
  }

  return (
    <div className="flex gap-2 flex-wrap mb-5">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש לפי שם תורם או סלולארי..."
        className="border border-line rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px] max-w-md bg-white"
      />
      <select value={status} onChange={handleStatusChange} className="border border-line rounded-lg px-3 py-2 text-sm bg-white">
        <option value="">כל הסטטוסים</option>
        <option>שולם</option>
        <option>ממתין</option>
        <option>נכשל</option>
        <option>בוטל</option>
        <option>מוחזר</option>
      </select>
    </div>
  );
}
