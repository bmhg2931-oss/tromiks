"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ExitIcon } from "./icons";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      aria-label="התנתקות"
      title="התנתקות"
      className="h-8 rounded-full px-3 flex items-center gap-1.5 border border-white/25 hover:bg-white/10 transition text-[12.5px]"
    >
      <ExitIcon />
      יציאה
    </button>
  );
}
