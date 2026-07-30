"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function UserMenu({
  name,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  roleLabel: string;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="h-8 text-[11px] pr-1.5 pl-3 rounded-full border border-white/30 bg-brass/25 flex items-center gap-1.5 whitespace-nowrap">
        {avatarUrl && (
          <Image src={avatarUrl} alt={name} width={22} height={22} className="w-[22px] h-[22px] rounded-full object-cover shrink-0" unoptimized />
        )}
        <span className="opacity-60">|</span>
        <span className="font-semibold">{name}</span>
        <span className="opacity-60">|</span>
        <span>{roleLabel}</span>
      </button>
      {open && (
        <div className="absolute end-0 top-full pt-1 w-full z-50">
          <div className="bg-ink text-[#eef2e4] border border-white/20 rounded-lg shadow-lg overflow-hidden">
            <Link href="/profile" className="block px-3 py-2 text-sm font-semibold hover:bg-white/10 whitespace-nowrap">
              פרופיל
            </Link>
            <Link href="/personal-settings" className="block px-3 py-2 text-sm font-semibold hover:bg-white/10 border-t border-white/15 whitespace-nowrap">
              הגדרות אישיות
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
