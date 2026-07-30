"use client";

import { useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/client";
import { runAIChat, confirmAIAction, type PendingAction } from "@/app/(app)/ai-chat-actions";
import { getUnreadSupportCount } from "@/app/(app)/support-chat-actions";
import SupportChatPanel from "./SupportChatPanel";
import { ChatIcon, SendIcon, MicIcon, SpeakerOnIcon, SpeakerOffIcon, ResetFilterIcon } from "./icons";

const SUPPORT_POLL_MS = 20_000;

type DisplayMessage = { role: "user" | "assistant" | "error"; text: string; boldPrefix?: string };

// ברכת פתיחה יידישאית לפי שעת היום - שם המשתמש מופיע בכל שעה, וכל הברכה (כולל השם) מודגשת
function buildGreeting(userName: string): DisplayMessage {
  const hour = new Date().getHours();
  let hello: string;
  if (hour >= 5 && hour < 12) hello = "א גוט מארגן";
  else if (hour >= 12 && hour < 17) hello = "א גוטן טאג";
  else if (hour >= 17 && hour < 21) hello = "א גוטן אוונט";
  else if (hour < 5) hello = "א גוטע נאכט, אוי ווי ס'שפעט...";
  else hello = "א גוטע נאכט";
  const greetingLine = `${userName ? `${hello}, ${userName}` : hello}!`;
  return {
    role: "assistant",
    text: `${greetingLine} אפשר לשאול אותי על אנשי קשר, יתרות וקמפיינים, וגם לבקש ממני להוסיף איש קשר, התחייבות או תרומה.`,
    boldPrefix: greetingLine,
  };
}

// מדגיש את פתיח הברכה (עד ה-"!") בתוך טקסט ההודעה - אין רינדור markdown רגיל בבועות
// הצ'אט, אז זו הדרך היחידה להבליט רק את הפתיח בלי לשנות את שאר ההודעה
function renderMessageText(m: DisplayMessage) {
  if (!m.boldPrefix || !m.text.startsWith(m.boldPrefix)) return m.text;
  return (
    <>
      <strong>{m.boldPrefix}</strong>
      {m.text.slice(m.boldPrefix.length)}
    </>
  );
}

// ה-Web Speech API אינו חלק מטיפוסי ה-DOM הרגילים של TypeScript - הצהרה מינימלית
// כדי לתמוך בזיהוי דיבור בדפדפן (Chrome/Edge) בלי תלות בשירות חיצוני
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getHebrewVoices(voices: SpeechSynthesisVoice[]) {
  // חלק ממנועי הדיבור (בעיקר ב-Windows) עדיין מתייגים קול עברי בקוד השפה הישן "iw"
  // (למשל "iw-IL") ולא ב-"he" - בודקים את שניהם כדי לא להחמיץ קול שכן מותקן
  return voices.filter((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith("he") || lang.startsWith("iw");
  });
}

// רשימת הקולות בדפדפן נטענת א-סינכרונית לפעמים (ריקה בקריאה הראשונה), ולעיתים גם
// מתמלאת בשני שלבים: תחילה סט חלקי של קולות ברירת מחדל, ורק אח"כ נורה voiceschanged
// עם הרשימה המלאה שכוללת קולות שהותקנו במערכת ההפעלה. לכן אסור "לעצור" ברגע שיש
// *איזשהם* קולות (זה היה הבאג - קול עברי שהותקן לא הופיע בסט הראשוני, אבל הפונקציה
// כבר סיימה כי היו קולות אחרים) - ממתינים ל-voiceschanged אלא אם כבר יש קול עברי
function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (getHebrewVoices(existing).length > 0) return resolve(existing);
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 1500);
  });
}

// צליל התראה קצר לכל תשובה שמתקבלת (שני "ביפים" קצרים) - נוצר ב-Web Audio API בלי
// תלות בקובץ שמע חיצוני, כדי שיעבוד גם בסביבה שמעולם לא הוגדר בה נכס מדיה
function playNotificationSound() {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;
  [0, 0.14].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 0 ? 780 : 980;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.14);
  });
  setTimeout(() => ctx.close(), 400);
}

// מחזיקים רפרנס גלובלי לאוטרנס האחרון - כרום ידוע בבאג שבו אובייקט Utterance
// שאין אליו הפניה חיה מ-JS "נאסף לגריסה" (garbage collected) לפני שהוא מספיק
// להישמע, וההקראה נבלעת בשקט לגמרי בלי שום שגיאה
let currentUtterance: SpeechSynthesisUtterance | null = null;

// מנקה את הטקסט לפני הקראה - מסירה תגי מארקדאון (**, -, #), אימוג'ים ותווים
// מיוחדים אחרים שהמנוע קורא אותם מילולית ("כוכבית", "מקף" וכו') וגורם להקראה
// מוזרה, בלי לגעת בטקסט המקורי שמוצג בבועת הצ'אט
function stripForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/["""]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// בוחר קול עברי, מעדיף קול גברי אם קיים אחד בדפדפן/מערכת ההפעלה (הזמינות משתנה -
// בלי קול עברי מותקן בכלל במערכת ההפעלה, הדפדפן לא יקריא עברית תקינה), ומוריד פיץ'
// כדי לקבל אפקט "מתכתי" יותר
async function speak(rawText: string): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const text = stripForSpeech(rawText);
  if (!text) return false;
  const voices = await getVoicesAsync();
  const heVoices = getHebrewVoices(voices);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "he-IL";
  utterance.pitch = 0.55;
  utterance.rate = 0.98;
  if (heVoices.length > 0) {
    const maleVoice = heVoices.find((v) => /male|man|asaf|david/i.test(v.name));
    utterance.voice = maleVoice ?? heVoices[0];
  }
  currentUtterance = utterance;
  window.speechSynthesis.cancel();
  // קריאה ל-speak() מיד אחרי cancel() באותו טיק היא באג מוכר בכרום שגורם
  // להקראה לא להתחיל בכלל - השהיה קצרה פותרת זאת
  setTimeout(() => {
    if (currentUtterance === utterance) {
      console.log("[TTS DEBUG] calling window.speechSynthesis.speak() now");
      window.speechSynthesis.speak(utterance);
    } else {
      console.log("[TTS DEBUG] skipped speak() - a newer utterance replaced this one");
    }
  }, 50);
  return heVoices.length > 0;
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  // מתחיל ריק בכוונה (לא GREETING("שעה") ישירות) כדי לא לתלות את הרינדור הראשון
  // בשעה הנוכחית - זה היה גורם ל-hydration mismatch בין שרת ולקוח; הברכה בפועל
  // נקבעת רק אחרי mount בתוך useEffect, יחד עם שם המשתמש
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [userName, setUserName] = useState("");
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  // speechSupported תלוי ב-window (זיהוי תמיכת דפדפן) - אסור לחשב את זה ישירות ב-render
  // כי זה שונה בין רינדור השרת ורינדור הלקוח הראשון ויגרום ל-hydration mismatch שיכול
  // לשבש אינטראקטיביות בכל העמוד; נקבע אותו רק אחרי mount בתוך useEffect
  const [speechSupported, setSpeechSupported] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [tab, setTab] = useState<"ai" | "support">("ai");
  const [isAdmin, setIsAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const openRef = useRef(open);
  const tabRef = useRef(tab);
  const lastUnreadSupportRef = useRef(0);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognition() !== null);
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMessages([buildGreeting("")]);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin");
      const name = profile?.full_name ?? "";
      setUserName(name);
      setMessages([buildGreeting(name)]);
    })();
  }, []);

  // התראה על הודעת תמיכה חדשה: פועל תמיד ברקע (לא רק כשטאב התמיכה פתוח), כדי
  // שהנקודה האדומה והצליל יתריעו גם כשהצ'אט כולו סגור או שהמשתמש נמצא בטאב ה-AI
  useEffect(() => {
    async function poll() {
      const res = await getUnreadSupportCount();
      if (!res.ok) return;
      if (res.count > lastUnreadSupportRef.current && (!openRef.current || tabRef.current !== "support")) {
        playNotificationSound();
        setHasUnread(true);
      }
      lastUnreadSupportRef.current = res.count;
    }
    poll();
    const interval = setInterval(poll, SUPPORT_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, loading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  function addAssistantMessage(text: string) {
    setMessages((m) => [...m, { role: "assistant", text }]);
    if (speechEnabled && text) speak(text);
    playNotificationSound();
    if (!openRef.current) setHasUnread(true);
  }

  // מאפס את השיחה לגמרי - הצ'אט אינו נשמר ב-DB, זה state מקומי בלבד, אז "רענון" ו"מחיקה"
  // הם בפועל אותה פעולה: התחלה מחדש מהיסטוריה ריקה
  function resetChat() {
    window.speechSynthesis?.cancel();
    setMessages([buildGreeting(userName)]);
    setHistory([]);
    setPending(null);
    setInput("");
    setLoading(false);
    setHasUnread(false);
  }

  function toggleRecording() {
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "he-IL";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(transcript);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  async function toggleSpeech() {
    if (speechEnabled) {
      window.speechSynthesis?.cancel();
      setSpeechEnabled(false);
      return;
    }
    setSpeechEnabled(true);
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const voices = await getVoicesAsync();
    if (getHebrewVoices(voices).length === 0) {
      setMessages((m) => [
        ...m,
        {
          role: "error",
          text: "לא נמצא קול עברי מותקן במחשב/בדפדפן שלך - לכן ההקראה לא תישמע כעברית תקינה (הדפדפן ישתמש בקול ברירת המחדל שלו). ב-Windows: הגדרות > שעה ושפה > דיבור > הוספת קולות > עברית, ואז לרענן את הדף.",
        },
      ]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    const newHistory: Anthropic.MessageParam[] = [...history, { role: "user", content: text }];
    const res = await runAIChat(newHistory);
    setLoading(false);
    if (!res.ok) {
      setMessages((m) => [...m, { role: "error", text: res.error }]);
      return;
    }
    setHistory(res.history);
    if (res.assistantText) addAssistantMessage(res.assistantText);
    setPending(res.pendingAction);
  }

  async function respondToAction(approved: boolean) {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setLoading(true);
    const res = await confirmAIAction(history, action, approved);
    setLoading(false);
    if (!res.ok) {
      setMessages((m) => [...m, { role: "error", text: res.error }]);
      return;
    }
    setHistory(res.history);
    if (res.assistantText) addAssistantMessage(res.assistantText);
    setPending(res.pendingAction);
  }

  return (
    <div className="fixed bottom-5 left-5 z-50 w-14 h-14">
      {open && (
        <div className="absolute bottom-full left-0 mb-3 w-96 max-w-[90vw] h-[32rem] max-h-[75vh] bg-white border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-b from-ink to-[#243024] text-[#eef2e4] px-4 py-3 flex items-center justify-between shrink-0">
            <span className="font-serif font-bold">צ&apos;אט תמיכה</span>
            <div className="flex items-center gap-2">
              {tab === "ai" && (
                <>
                  <button
                    type="button"
                    onClick={resetChat}
                    title="ניקוי ואיפוס השיחה"
                    className="w-6 h-6 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition"
                  >
                    <ResetFilterIcon />
                  </button>
                  <button
                    type="button"
                    onClick={toggleSpeech}
                    title={speechEnabled ? "כיבוי הקראה קולית" : "הפעלת הקראה קולית"}
                    className={`w-6 h-6 flex items-center justify-center rounded-full transition ${speechEnabled ? "bg-brass text-white" : "opacity-70 hover:opacity-100"}`}
                  >
                    {speechEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
                  </button>
                </>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-lg leading-none opacity-70 hover:opacity-100">
                ×
              </button>
            </div>
          </div>

          <div className="flex border-b border-line shrink-0">
            <button
              type="button"
              onClick={() => setTab("ai")}
              className={`flex-1 py-2 text-xs font-semibold transition ${tab === "ai" ? "text-brass-deep border-b-2 border-brass-deep" : "text-ink-soft hover:bg-parchment/50"}`}
            >
              צ&apos;אט AI
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("support");
                setHasUnread(false);
              }}
              className={`flex-1 py-2 text-xs font-semibold transition ${tab === "support" ? "text-brass-deep border-b-2 border-brass-deep" : "text-ink-soft hover:bg-parchment/50"}`}
            >
              צ&apos;אט עם הנהלת המערכת
            </button>
          </div>

          {tab === "support" ? (
            <SupportChatPanel isAdmin={isAdmin} />
          ) : (
          <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-brass text-white rounded-xl rounded-tl-none px-3 py-2 text-sm whitespace-pre-wrap"
                    : m.role === "error"
                    ? "mr-auto max-w-[85%] bg-red-50 border border-red-200 text-red-700 rounded-xl rounded-tr-none px-3 py-2 text-sm whitespace-pre-wrap"
                    : "mr-auto max-w-[85%] bg-parchment/60 text-ink rounded-xl rounded-tr-none px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {renderMessageText(m)}
              </div>
            ))}

            {pending && (
              <div className="mr-auto max-w-[90%] bg-white border border-brass/50 rounded-xl px-3 py-2.5 text-sm shadow">
                <p className="font-semibold mb-2 whitespace-pre-wrap">{pending.label}</p>
                <p className="text-xs text-ink-soft mb-2">לאשר ביצוע הפעולה?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => respondToAction(true)}
                    className="px-3 py-1.5 rounded-lg bg-brass text-white text-xs font-semibold hover:brightness-95"
                  >
                    אישור וביצוע
                  </button>
                  <button
                    type="button"
                    onClick={() => respondToAction(false)}
                    className="px-3 py-1.5 rounded-lg border border-line text-xs hover:bg-parchment/50"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}

            {loading && <div className="mr-auto text-xs text-ink-soft px-1">חושב...</div>}
          </div>

          <div className="border-t border-line p-2.5 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={recording ? "מקשיב..." : "שאל/י שאלה או בקש/י פעולה..."}
              disabled={loading || !!pending}
              className="in flex-1 text-sm"
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={loading || !!pending}
                title="דיבור למיקרופון"
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-40 ${
                  recording ? "bg-wine text-white animate-pulse" : "border border-line hover:bg-parchment"
                }`}
              >
                <MicIcon />
              </button>
            )}
            <button
              type="button"
              onClick={send}
              disabled={loading || !!pending || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-full bg-brass text-white flex items-center justify-center disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>
          </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setHasUnread(false);
        }}
        className="relative w-14 h-14 rounded-full bg-brass text-white shadow-xl flex items-center justify-center hover:brightness-95 transition"
        title="עוזר AI"
      >
        <ChatIcon size={26} />
        {hasUnread && !open && (
          <span className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-wine border-2 border-white" />
        )}
      </button>
    </div>
  );
}
