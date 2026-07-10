"use client";

import { useEffect, useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { runAIChat, confirmAIAction, type PendingAction } from "@/app/(app)/ai-chat-actions";
import { ChatIcon, SendIcon } from "./icons";

type DisplayMessage = { role: "user" | "assistant" | "error"; text: string };

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { role: "assistant", text: "שלום! אפשר לשאול אותי על אנשי קשר, יתרות וקמפיינים, וגם לבקש ממני להוסיף איש קשר, התחייבות או תרומה." },
  ]);
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, loading]);

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
    if (res.assistantText) setMessages((m) => [...m, { role: "assistant", text: res.assistantText }]);
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
    if (res.assistantText) setMessages((m) => [...m, { role: "assistant", text: res.assistantText }]);
    setPending(res.pendingAction);
  }

  return (
    <div className="fixed bottom-5 left-5 z-50">
      {open && (
        <div className="mb-3 w-96 max-w-[90vw] h-[32rem] max-h-[75vh] bg-white border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-b from-ink to-[#243024] text-[#eef2e4] px-4 py-3 flex items-center justify-between shrink-0">
            <span className="font-serif font-bold">עוזר AI</span>
            <button type="button" onClick={() => setOpen(false)} className="text-lg leading-none opacity-70 hover:opacity-100">
              ×
            </button>
          </div>

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
                {m.text}
              </div>
            ))}

            {pending && (
              <div className="mr-auto max-w-[90%] bg-white border border-brass/50 rounded-xl px-3 py-2.5 text-sm shadow">
                <p className="font-semibold mb-2">{pending.label}</p>
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
              placeholder="שאל/י שאלה או בקש/י פעולה..."
              disabled={loading || !!pending}
              className="in flex-1 text-sm"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !!pending || !input.trim()}
              className="w-9 h-9 shrink-0 rounded-full bg-brass text-white flex items-center justify-center disabled:opacity-40"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-brass text-white shadow-xl flex items-center justify-center hover:brightness-95 transition"
        title="עוזר AI"
      >
        <ChatIcon size={26} />
      </button>
    </div>
  );
}
