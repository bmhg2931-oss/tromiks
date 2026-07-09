"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavItem({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`block pr-3 py-1.5 px-2 rounded-md text-sm ${
        active ? "bg-brass/15 text-brass-deep font-semibold" : "text-ink hover:bg-parchment"
      }`}
    >
      {children}
    </Link>
  );
}

export default function SettingsSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6 items-start flex-wrap">
      <nav className="w-56 shrink-0 bg-white border border-line rounded-xl shadow p-3 space-y-4">
        <div>
          <div className="text-xs font-semibold text-ink-soft px-2 py-1.5">אנשי קשר</div>
          <div className="space-y-1">
            <NavItem href="/settings/contacts" active={pathname === "/settings/contacts"}>
              תצוגת אנשי קשר
            </NavItem>
            <NavItem href="/settings/contacts/import" active={pathname === "/settings/contacts/import"}>
              ייבוא אנשי קשר
            </NavItem>
            <NavItem href="/settings/contacts/cities" active={pathname === "/settings/contacts/cities"}>
              ערים
            </NavItem>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-soft px-2 py-1.5">תרומות ותשלומים</div>
          <div className="space-y-1">
            <NavItem href="/settings/donations/display" active={pathname === "/settings/donations/display"}>
              תצוגת רשימה
            </NavItem>
            <NavItem href="/settings/donations/categories" active={pathname === "/settings/donations/categories"}>
              קטגוריות
            </NavItem>
            <NavItem href="/settings/donations/handlers" active={pathname === "/settings/donations/handlers"}>
              מטפלים
            </NavItem>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-soft px-2 py-1.5">משתמשים והרשאות</div>
          <div className="space-y-1">
            <NavItem href="/settings/users" active={pathname === "/settings/users"}>
              ניהול משתמשים
            </NavItem>
            <NavItem href="/settings/contacts/visibility" active={pathname === "/settings/contacts/visibility"}>
              הרשאות לפי תגית
            </NavItem>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-ink-soft px-2 py-1.5">כללי</div>
          <div className="space-y-1">
            <NavItem href="/settings/trash" active={pathname === "/settings/trash"}>
              פריטים שנמחקו
            </NavItem>
          </div>
        </div>
      </nav>

      <div className="flex-1 min-w-[280px] bg-white border border-line rounded-xl shadow p-6">{children}</div>
    </div>
  );
}
