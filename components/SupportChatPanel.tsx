"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  sendSupportMessage,
  listMyConversation,
  startNewSupportConversation,
  listSupportConversations,
  listConversationMessages,
  suggestSupportReply,
  deleteSupportConversation,
  type SupportMessage,
  type SupportConversationSummary,
} from "@/app/(app)/support-chat-actions";
import { SendIcon, ResetFilterIcon, TrashIcon } from "./icons";

const POLL_MS = 15_000;

function BackArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3l-5 5 5 5" />
    </svg>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportChatPanel({ isAdmin }: { isAdmin: boolean }) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [conversations, setConversations] = useState<SupportConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<SupportConversationSummary | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAdmin) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, [isAdmin]);

  async function refresh() {
    if (isAdmin) {
      if (activeConversation) {
        const res = await listConversationMessages(activeConversation.userId);
        if (res.ok) setMessages(res.messages ?? []);
      } else {
        const res = await listSupportConversations();
        if (res.ok) setConversations(res.conversations ?? []);
      }
    } else {
      const res = await listMyConversation();
      if (res.ok) setMessages(res.messages ?? []);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeConversation?.userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    const conversationUserId = isAdmin ? activeConversation?.userId : myUserId;
    if (!text || sending || !conversationUserId) return;
    setSending(true);
    setInput("");
    await sendSupportMessage(conversationUserId, text);
    await refresh();
    setSending(false);
  }

  async function handleNewConversation() {
    await startNewSupportConversation();
    setMessages([]);
  }

  async function handleInputFocus() {
    if (!isAdmin || !activeConversation || suggestion !== null || suggesting) return;
    const last = messages[messages.length - 1];
    if (!last || last.is_from_admin) return; // אין הודעת משתמש חדשה שדורשת מענה
    setSuggesting(true);
    const res = await suggestSupportReply(activeConversation.userId);
    setSuggesting(false);
    if (res.ok && res.suggestion) setSuggestion(res.suggestion);
  }

  async function handleSendSuggestion() {
    const text = suggestion?.trim();
    if (!text || !activeConversation || sending) return;
    setSending(true);
    await sendSupportMessage(activeConversation.userId, text);
    await refresh();
    setSuggestion(null);
    setSending(false);
  }

  async function handleDeleteConversation(userId: string, userName: string) {
    if (!confirm(`למחוק את כל שיחת התמיכה עם ${userName}? הפעולה אינה ניתנת לשחזור.`)) return;
    const res = await deleteSupportConversation(userId);
    if (!res.ok) {
      alert(res.error ?? "שגיאה במחיקת השיחה");
      return;
    }
    if (activeConversation?.userId === userId) {
      setActiveConversation(null);
      setMessages([]);
    }
    await refresh();
  }

  if (isAdmin && !activeConversation) {
    return (
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-ink-soft text-center p-4">אין שיחות תמיכה עדיין.</p>
        ) : (
          conversations.map((c) => (
            <div key={c.userId} className="w-full flex items-center gap-1 rounded-lg hover:bg-parchment/60 transition">
              <button
                type="button"
                onClick={() => {
                  setSuggestion(null);
                  setActiveConversation(c);
                }}
                className="flex-1 min-w-0 text-right p-2.5 flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {c.userName}
                    {c.unreadCount > 0 && (
                      <span className="bg-wine text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{c.unreadCount}</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft truncate">{c.lastMessage}</p>
                </div>
                <span className="text-[10px] text-ink-soft shrink-0">{formatTime(c.lastMessageAt)}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConversation(c.userId, c.userName)}
                title="מחיקת שיחה"
                aria-label={`מחיקת שיחה עם ${c.userName}`}
                className="shrink-0 w-7 h-7 ml-1 rounded-md text-wine hover:bg-wine hover:text-white flex items-center justify-center transition"
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <>
      {isAdmin && activeConversation && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0">
          <button
            type="button"
            onClick={() => {
              setSuggestion(null);
              setActiveConversation(null);
            }}
            aria-label="חזרה לרשימת השיחות"
            className="w-7 h-7 rounded-full hover:bg-parchment flex items-center justify-center transition"
          >
            <BackArrowIcon />
          </button>
          <span className="text-sm font-semibold flex-1">{activeConversation.userName}</span>
          <button
            type="button"
            onClick={() => handleDeleteConversation(activeConversation.userId, activeConversation.userName)}
            title="מחיקת שיחה"
            aria-label="מחיקת שיחה"
            className="w-7 h-7 rounded-md text-wine hover:bg-wine hover:text-white flex items-center justify-center transition"
          >
            <TrashIcon />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {!isAdmin && messages.length === 0 && (
          <p className="text-xs text-ink-soft text-center p-4">כתוב הודעה כדי ליצור קשר עם הנהלת המערכת.</p>
        )}
        {messages.map((m) =>
          m.is_system ? (
            <div key={m.id} className="text-center text-[11px] text-ink-soft/70 py-1">
              {m.body} · {formatTime(m.created_at)}
            </div>
          ) : (
            <div
              key={m.id}
              className={
                m.is_from_admin === isAdmin
                  ? "ml-auto max-w-[85%] bg-brass text-white rounded-xl rounded-tl-none px-3 py-2 text-sm whitespace-pre-wrap"
                  : "mr-auto max-w-[85%] bg-parchment/60 text-ink rounded-xl rounded-tr-none px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {m.body}
              <div className="text-[10px] opacity-70 mt-1">{formatTime(m.created_at)}</div>
            </div>
          )
        )}
      </div>

      {isAdmin && suggesting && (
        <p className="text-xs text-ink-soft px-3 py-1.5 border-t border-line">מכין הצעת מענה...</p>
      )}

      {isAdmin && suggestion !== null && (
        <div className="border-t border-line p-3 bg-parchment/40 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">הצעת מענה מ-AI (ניתן לערוך)</span>
            <button type="button" onClick={() => setSuggestion(null)} className="text-xs text-ink-soft hover:text-ink">
              סגירה
            </button>
          </div>
          <textarea
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            className="in text-sm w-full min-h-[90px]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="text-xs border border-line rounded-full px-3 py-1.5 hover:bg-white transition"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSendSuggestion}
              disabled={sending || !suggestion.trim()}
              className="text-xs bg-brass hover:bg-brass-deep text-white font-semibold rounded-full px-4 py-1.5 transition disabled:opacity-60"
            >
              {sending ? "שולח..." : "שליחה"}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-line p-2.5 flex items-center gap-2 shrink-0">
        {!isAdmin && (
          <button
            type="button"
            onClick={handleNewConversation}
            title="שיחה חדשה"
            className="w-9 h-9 shrink-0 rounded-full border border-line hover:bg-parchment flex items-center justify-center transition"
          >
            <ResetFilterIcon />
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          onFocus={handleInputFocus}
          placeholder="כתוב הודעה..."
          disabled={sending || (isAdmin && !activeConversation)}
          className="in flex-1 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim() || (isAdmin && !activeConversation)}
          className="w-9 h-9 shrink-0 rounded-full bg-brass text-white flex items-center justify-center disabled:opacity-40"
        >
          <SendIcon />
        </button>
      </div>
    </>
  );
}
