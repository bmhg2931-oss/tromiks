"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function ContactsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="6.5" r="3" />
      <path d="M2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M13.5 8a2.5 2.5 0 1 0 0-5" />
      <path d="M15.5 12.3c1.8.5 3 1.9 3 4.7" />
    </svg>
  );
}

function DonationsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="6.8" cy="5.6" rx="4.3" ry="2.2" />
      <path d="M2.5 5.6v3c0 1.2 1.9 2.2 4.3 2.2s4.3-1 4.3-2.2v-3" />
      <path d="M2.5 8.6v3c0 1.2 1.9 2.2 4.3 2.2s4.3-1 4.3-2.2v-3" />
      <ellipse cx="13.2" cy="9.4" rx="3.8" ry="1.9" />
      <path d="M9.4 9.4v3c0 1 1.7 1.9 3.8 1.9s3.8-.9 3.8-1.9v-3" />
    </svg>
  );
}

function CampaignsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2.5v15" />
      <path d="M3 3.5h9l-1.5 3 1.5 3H3" />
    </svg>
  );
}

const GEAR_TEETH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function SettingsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="5.1" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
      {GEAR_TEETH_ANGLES.map((angle) => (
        <rect
          key={angle}
          x="8.9"
          y="1.2"
          width="2.2"
          height="2.6"
          rx="0.6"
          fill="currentColor"
          stroke="none"
          transform={`rotate(${angle} 10 10)`}
        />
      ))}
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: collapsed ? undefined : "rotate(180deg)", transition: "transform 0.2s" }}
    >
      <path d="M10 3L5 8l5 5" />
    </svg>
  );
}

const NAV_ITEMS_BEFORE = [
  { href: "/contacts", label: "אנשי קשר", Icon: ContactsIcon },
  { href: "/donations", label: "תרומות ותשלומים", Icon: DonationsIcon },
];
const NAV_ITEMS_AFTER = [{ href: "/settings", label: "הגדרות", Icon: SettingsIcon }];

function SubChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-auto shrink-0"
      style={{ transform: open ? "rotate(-90deg)" : undefined, transition: "transform 0.15s" }}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export default function Sidebar({ campaigns = [] }: { campaigns?: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(pathname.startsWith("/campaigns"));

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-56"} shrink-0 h-screen sticky top-0 bg-gradient-to-b from-ink to-[#243024] text-[#eef2e4] flex flex-col shadow-lg z-40 rounded-tl-2xl transition-[width] duration-200`}
    >
      <div className="px-4 py-5 border-b border-white/10">
        <Link href="/contacts" className="flex flex-col items-center gap-1 text-center">
          {collapsed ? (
            <Image src="/logo.png" alt="תרומיקס" width={34} height={34} className="h-8 w-8 object-contain" priority />
          ) : (
            <>
              <Image src="/logo.png" alt="תרומיקס" width={112} height={112} className="w-1/2 h-auto object-contain" priority />
              <div className="font-serif font-bold text-2xl leading-tight mt-1.5">תרומיקס</div>
              <div className="text-[11px] text-[#c7cabd] leading-tight">ניהול תרומות ותשלומים</div>
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS_BEFORE.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 py-2.5 text-sm font-semibold transition ${
                collapsed ? "justify-center mx-2 rounded-full" : "pr-5 pl-4 rounded-l-full"
              } ${active ? "bg-brass text-white" : "text-[#c7cabd] hover:bg-white/10 hover:text-white"}`}
            >
              <Icon />
              {!collapsed && label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => (collapsed ? setCollapsed(false) : setCampaignsOpen((o) => !o))}
          title={collapsed ? "קמפיינים" : undefined}
          className={`flex items-center gap-3 py-2.5 text-sm font-semibold transition w-full ${
            collapsed ? "justify-center mx-2 rounded-full" : "pr-5 pl-4 rounded-l-full"
          } ${pathname.startsWith("/campaigns") ? "bg-brass text-white" : "text-[#c7cabd] hover:bg-white/10 hover:text-white"}`}
        >
          <CampaignsIcon />
          {!collapsed && (
            <>
              קמפיינים
              <SubChevron open={campaignsOpen} />
            </>
          )}
        </button>
        {campaignsOpen && !collapsed && (
          <div className="pr-4">
            <Link
              href="/campaigns"
              className={`block py-2 pr-6 pl-4 text-xs rounded-l-full transition ${
                pathname === "/campaigns" ? "bg-white/15 text-white font-semibold" : "text-[#c7cabd] hover:bg-white/10 hover:text-white"
              }`}
            >
              כל הקמפיינים
            </Link>
            {campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className={`block py-2 pr-6 pl-4 text-xs rounded-l-full transition truncate ${
                  pathname === `/campaigns/${c.id}` ? "bg-white/15 text-white font-semibold" : "text-[#c7cabd] hover:bg-white/10 hover:text-white"
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {NAV_ITEMS_AFTER.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 py-2.5 text-sm font-semibold transition ${
                collapsed ? "justify-center mx-2 rounded-full" : "pr-5 pl-4 rounded-l-full"
              } ${active ? "bg-brass text-white" : "text-[#c7cabd] hover:bg-white/10 hover:text-white"}`}
            >
              <Icon />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="py-4 px-4 border-t border-white/10 flex">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "הרחבת התפריט" : "כיווץ התפריט"}
          className="mr-auto shrink-0 w-6 h-6 rounded-full border border-white/25 hover:bg-white/10 flex items-center justify-center transition"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </div>
    </aside>
  );
}
