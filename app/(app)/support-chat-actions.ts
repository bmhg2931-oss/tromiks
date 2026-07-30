"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const SUGGEST_MODEL = "claude-sonnet-4-5-20250929";

export type SupportMessage = {
  id: string;
  conversation_user_id: string;
  sender_id: string;
  is_from_admin: boolean;
  is_system: boolean;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type SupportConversationSummary = {
  userId: string;
  userName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

async function currentContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, support_thread_started_at")
    .eq("id", user.id)
    .single();
  return {
    userId: user.id,
    role: (profile?.role as string) ?? "secretary",
    fullName: profile?.full_name ?? "",
    threadStartedAt: profile?.support_thread_started_at as string | null,
  };
}

export async function sendSupportMessage(
  conversationUserId: string,
  body: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx) return { ok: false, error: "לא מחובר" };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "לא ניתן לשלוח הודעה ריקה" };
  if (ctx.role !== "admin" && conversationUserId !== ctx.userId) return { ok: false, error: "אין הרשאה" };

  const { error } = await supabase.from("support_messages").insert({
    conversation_user_id: conversationUserId,
    sender_id: ctx.userId,
    is_from_admin: ctx.role === "admin" && ctx.userId !== conversationUserId,
    body: trimmed,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// שיחת המשתמש הנוכחי עם ההנהלה - מסמן אוטומטית כנקרא כל תשובת admin שהוחזרה
export async function listMyConversation(): Promise<{ ok: boolean; messages?: SupportMessage[]; error?: string }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx) return { ok: false, error: "לא מחובר" };

  let query = supabase
    .from("support_messages")
    .select("*")
    .eq("conversation_user_id", ctx.userId)
    .order("created_at", { ascending: true });
  if (ctx.threadStartedAt) query = query.gte("created_at", ctx.threadStartedAt);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("support_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_user_id", ctx.userId)
    .eq("is_from_admin", true)
    .is("read_at", null);

  return { ok: true, messages: data ?? [] };
}

// "שיחה חדשה" מבחינת המשתמש: מסתיר הודעות ישנות מהתצוגה שלו בלבד (לא מוחק אותן -
// admin ממשיך לראות את כל ההיסטוריה בתצוגת הניהול שלו)
export async function startNewSupportConversation(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "לא מחובר" };

  // הודעת מערכת שנשארת גלויה רק לתצוגת הניהול של admin (לא מסוננת שם לפי
  // support_thread_started_at) - כדי שהמנהל ידע שהמשתמש איפס את השיחה מהצד שלו.
  // is_system: true כדי שתוצג ככיתוב קטן בין הודעות, לא כבועת שיחה שנשלחה בפועל
  await supabase.from("support_messages").insert({
    conversation_user_id: user.id,
    sender_id: user.id,
    is_from_admin: false,
    is_system: true,
    body: "המשתמש מחק את השיחה",
  });

  const { error } = await supabase
    .from("profiles")
    .update({ support_thread_started_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listSupportConversations(): Promise<{
  ok: boolean;
  conversations?: SupportConversationSummary[];
  error?: string;
}> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx || ctx.role !== "admin") return { ok: false, error: "אין הרשאה" };

  const { data: rows, error } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const byUser = new Map<string, SupportMessage[]>();
  for (const r of rows ?? []) {
    if (!byUser.has(r.conversation_user_id)) byUser.set(r.conversation_user_id, []);
    byUser.get(r.conversation_user_id)!.push(r);
  }
  const userIds = Array.from(byUser.keys());
  if (userIds.length === 0) return { ok: true, conversations: [] };

  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "משתמש"]));

  const conversations: SupportConversationSummary[] = userIds
    .map((uid) => {
      const msgs = byUser.get(uid)!;
      const last = msgs[0];
      const unreadCount = msgs.filter((m) => !m.is_from_admin && !m.read_at).length;
      return { userId: uid, userName: nameById.get(uid) ?? "משתמש", lastMessage: last.body, lastMessageAt: last.created_at, unreadCount };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

  return { ok: true, conversations };
}

// מוחק שיחת תמיכה שלמה של משתמש נתון (מחיקה קשה - זהו יומן צ'אט, לא רשומה כספית
// שדורשת שחזור) - admin בלבד
export async function deleteSupportConversation(conversationUserId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx || ctx.role !== "admin") return { ok: false, error: "אין הרשאה" };

  const { error } = await supabase.from("support_messages").delete().eq("conversation_user_id", conversationUserId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listConversationMessages(
  conversationUserId: string
): Promise<{ ok: boolean; messages?: SupportMessage[]; error?: string }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx || ctx.role !== "admin") return { ok: false, error: "אין הרשאה" };

  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("conversation_user_id", conversationUserId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("support_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_user_id", conversationUserId)
    .eq("is_from_admin", false)
    .is("read_at", null);

  return { ok: true, messages: data ?? [] };
}

// למשתמש רגיל: כמה תשובות admin טרם נקראו. ל-admin: כמה הודעות משתמשים (מכל
// השיחות יחד) טרם נקראו - משמש לנקודה האדומה על לחצן הצ'אט
export async function getUnreadSupportCount(): Promise<{ ok: boolean; count: number }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx) return { ok: true, count: 0 };

  let query = supabase.from("support_messages").select("id", { count: "exact", head: true }).is("read_at", null);
  query = ctx.role === "admin" ? query.eq("is_from_admin", false) : query.eq("conversation_user_id", ctx.userId).eq("is_from_admin", true);
  const { count } = await query;
  return { ok: true, count: count ?? 0 };
}

// מנסח למנהל הצעת מענה קצרה על סמך השיחה עד כה - מוצג בממשק כטקסט הניתן לעריכה
// לפני שליחה בפועל, לא נשלח אוטומטית
export async function suggestSupportReply(
  conversationUserId: string
): Promise<{ ok: boolean; suggestion?: string; error?: string }> {
  const supabase = await createClient();
  const ctx = await currentContext(supabase);
  if (!ctx || ctx.role !== "admin") return { ok: false, error: "אין הרשאה" };

  const { data: rows, error } = await supabase
    .from("support_messages")
    .select("body, is_from_admin")
    .eq("conversation_user_id", conversationUserId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { ok: false, error: error.message };
  const recent = (rows ?? []).slice().reverse();
  if (recent.length === 0) return { ok: false, error: "אין הודעות בשיחה" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "לא הוגדר מפתח ANTHROPIC_API_KEY בקובץ .env.local" };

  const transcript = recent.map((m) => `${m.is_from_admin ? "הנהלה" : "משתמש"}: ${m.body}`).join("\n");
  const anthropic = new Anthropic({ apiKey });
  try {
    const response = await anthropic.messages.create({
      model: SUGGEST_MODEL,
      max_tokens: 300,
      system:
        'אתה מנסח הצעת תשובה קצרה בעברית עבור הנהלת מערכת "תרומיקס" שעונה למשתמש בצ\'אט תמיכה פנימי. ' +
        "כתוב בטון קליל, טבעי וישיר כמו הודעת צ'אט רגילה בין אנשים - לא בסגנון רשמי או תבניתי, ולא בסגנון שנשמע כמו תשובת AI " +
        "(בלי \"בהחלט\", \"אשמח לעזור\", \"אין בעיה\" כפתיחה קבועה וכו'). תהיה ממוקד וקצר, כאילו מישהו מהצוות פשוט מקליד תשובה מהירה. " +
        "ענה תמיד בלשון זכר בלבד ולעולם אל תשתמש באימוג'ים. החזר רק את נוסח ההודעה עצמה לשליחה, בלי הקדמות כמו \"הנה הצעה\" ובלי מרכאות מסביב. " +
        "סינון תוכן (בדומה לסינון נטפרי): לעולם אל תנסח תשובה שמכילה תוכן לא צנוע, מיני, אלים, פוגעני, או תוכן שאינו הולם את רוח " +
        "הקהילה החרדית - גם אם הודעת המשתמש בשיחה מכילה תוכן כזה. במקרה כזה, הצע תשובה מקצועית וניטרלית שאינה נענית לתוכן הבעייתי.",
      messages: [{ role: "user", content: `זוהי השיחה עד כה:\n${transcript}\n\nנסח הצעת תשובה קצרה מההנהלה למשתמש, בהתאם להודעה האחרונה שלו.` }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "לא התקבלה הצעה מה-AI" };
    return { ok: true, suggestion: text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בפנייה ל-AI" };
  }
}
