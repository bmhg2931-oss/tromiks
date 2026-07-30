import { createClient } from "@supabase/supabase-js";

// לקוח בעל הרשאות מלאות (service role) - עוקף RLS לגמרי. שימוש בשרת בלבד
// (server actions / route handlers), ולפעולות ניהוליות רגישות בלבד (למשל
// מחיקת משתמש דרך Auth Admin API). אסור לייבא לקובץ שרץ בצד הלקוח.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
