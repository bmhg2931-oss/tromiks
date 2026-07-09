"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LoginCard from "@/components/login/LoginCard";
import LoginInput from "@/components/login/LoginInput";
import SubmitButton from "@/components/login/SubmitButton";
import StaggerItem from "@/components/login/StaggerItem";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      setShakeTrigger((n) => n + 1);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setShakeTrigger((n) => n + 1);
      setLoading(false);
    } else {
      router.push("/contacts");
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-10">
      <LoginCard shakeTrigger={shakeTrigger}>
        <StaggerItem>
          <h1 className="font-serif text-xl font-bold mb-4">קביעת סיסמה חדשה</h1>
        </StaggerItem>

        <form onSubmit={handleSubmit} className="space-y-4">
          <StaggerItem>
            <LoginInput label="סיסמה חדשה" type="password" required minLength={6} value={password} onChange={setPassword} />
          </StaggerItem>
          <StaggerItem>
            <LoginInput
              label="אימות סיסמה"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </StaggerItem>

          {error && <p className="text-sm text-wine">{error}</p>}

          <StaggerItem>
            <SubmitButton loading={loading}>{loading ? "שומר..." : "שמירת סיסמה"}</SubmitButton>
          </StaggerItem>
        </form>
      </LoginCard>
    </div>
  );
}
