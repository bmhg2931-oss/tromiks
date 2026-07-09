"use client";

import Image from "next/image";
import SignOutButton from "@/components/SignOutButton";

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-parchment via-parchment to-parchment-deep">
      <div className="max-w-sm w-full rounded-2xl border border-line bg-white p-8 text-center shadow-xl">
        <Image src="/logo.png" alt="תרומיקס" width={48} height={48} className="h-12 w-12 object-contain mx-auto mb-4" priority />
        <h1 className="font-serif text-xl font-bold mb-2">ההרשמה שלך התקבלה</h1>
        <p className="text-sm text-ink-soft leading-relaxed mb-6">
          החשבון שלך ממתין לאישור מנהל המערכת. לאחר שתאושר/י ויוגדר לך תפקיד, תוכל/י להתחבר ולהשתמש במערכת.
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}
