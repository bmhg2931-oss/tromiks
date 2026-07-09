"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/login/AnimatedBackground";
import DescriptionPanel from "@/components/login/DescriptionPanel";
import BanknoteTrail from "@/components/login/BanknoteTrail";
import LoginCard from "@/components/login/LoginCard";
import StaggerItem from "@/components/login/StaggerItem";
import LoginInput from "@/components/login/LoginInput";
import SubmitButton from "@/components/login/SubmitButton";
import GoogleButton from "@/components/login/GoogleButton";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shakeTrigger, setShakeTrigger] = useState(0);

  useEffect(() => {
    if (error) setShakeTrigger((n) => n + 1);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        // נשארים במצב טעינה (ספינר) עד שהניווט לעמוד הראשי בפועל מתרחש - לא עוצרים
        // אלא אם הייתה שגיאת התחברות
        router.push("/contacts");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) setError(error.message);
      else
        setNotice(
          'נרשמת בהצלחה. בדוק/י את תיבת הדוא"ל לאישור החשבון, ואז התחבר/י. לאחר ההתחברות הראשונה, החשבון ימתין לאישור מנהל המערכת.'
        );
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/contacts` },
    });
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('נא להזין דוא"ל ולאחר מכן ללחוץ שוב על "שכחתי סיסמה"');
      return;
    }
    setResetSending(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setResetSending(false);
    if (error) setError(error.message);
    else setNotice("נשלח אליך מייל עם קישור לאיפוס הסיסמה.");
  }

  return (
    <div className="relative min-h-screen flex">
      <AnimatedBackground />

      <DescriptionPanel />

      <BanknoteTrail className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <LoginCard shakeTrigger={shakeTrigger}>
          <StaggerItem className="flex items-center gap-3 mb-6">
            <Image src="/logo.png" alt="תרומיקס" width={40} height={40} className="h-10 w-10 object-contain" priority />
            <div>
              <div className="font-serif font-bold text-lg text-ink">תרומיקס</div>
              <div className="text-xs text-ink-soft">ניהול תרומות ואנשי קשר</div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <h1 className="font-serif text-xl font-bold mb-4">{mode === "signin" ? "התחברות" : "יצירת חשבון"}</h1>
          </StaggerItem>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <StaggerItem>
                <LoginInput label="שם מלא" type="text" required value={fullName} onChange={setFullName} />
              </StaggerItem>
            )}
            <StaggerItem>
              <LoginInput label='דוא"ל' type="email" required value={email} onChange={setEmail} />
            </StaggerItem>
            <StaggerItem>
              <LoginInput label="סיסמה" type="password" required minLength={6} value={password} onChange={setPassword} />
            </StaggerItem>

            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-sm text-wine"
                >
                  {error}
                </motion.p>
              )}
              {notice && (
                <motion.p
                  key="notice"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-sm text-sage"
                >
                  {notice}
                </motion.p>
              )}
            </AnimatePresence>

            <StaggerItem>
              <SubmitButton loading={loading}>
                {loading ? (mode === "signin" ? "מתחבר..." : "נרשם/ת...") : mode === "signin" ? "כניסה למערכת" : "הרשמה"}
              </SubmitButton>
            </StaggerItem>
          </form>

          <StaggerItem className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-xs text-ink-soft">או</span>
            <div className="flex-1 h-px bg-line" />
          </StaggerItem>

          <StaggerItem>
            <GoogleButton onClick={handleGoogleSignIn} />
          </StaggerItem>

          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-soft">
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="underline">
              {mode === "signin" ? "אין לך חשבון? הרשמה" : "יש לך כבר חשבון? התחברות"}
            </button>
            {mode === "signin" && (
              <>
                <span className="opacity-40">|</span>
                <button onClick={handleForgotPassword} disabled={resetSending} className="underline disabled:opacity-50">
                  {resetSending ? "שולח..." : "שכחתי סיסמה"}
                </button>
              </>
            )}
          </div>
        </LoginCard>
      </BanknoteTrail>
    </div>
  );
}
