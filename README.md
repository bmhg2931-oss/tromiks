# תרומיקס — מערכת ניהול תרומות ואנשי קשר (Next.js + Supabase)

מערכת CRM לניהול תרומות עבור מוסד/קהילה: אנשי קשר, התחייבויות ותשלומים, קמפיינים,
סליקת אשראי (נדרים פלוס), שיחות VoIP מהדפדפן, צ'אט AI, ותזכורות אוטומטיות במייל.
Next.js 14 (App Router + Server Actions) + Supabase (Postgres + Auth + RLS + Storage).
התחברות משתמשים והרשאות לפי תפקיד, נאכפות **ברמת מסד הנתונים** (RLS), לא רק בממשק.

## מודולים פעילים

| מודול | קבצים עיקריים | מה זה עושה בפועל |
|---|---|---|
| **אנשי קשר** | `app/(app)/contacts/*` | רשימה/כרטיס איש קשר עם סינון (מחלקה/עיר/רחוב/תגית/יתרה פתוחה), טאבים לפעילות/היסטוריה/קבצים/משימות. אוכף הצנעת שדות/מקטעים לפי תפקיד ("visibility rules"). כולל ייצוא לאקסל, השלמת מיקוד (Google Maps), צירוף קבצים (Storage), הפקת דוח PDF/מייל לאיש קשר |
| **תרומות ותשלומים** | `app/(app)/donations/*` | רשימה מאוחדת של התחייבויות (`pledges`) ותשלומים בפועל (`donations`), כולל תצוגה משולבת כשתשלום משויך להתחייבות. שורות שיק/העברה מרובות לתשלום אחד. OCR של שיקים סרוקים דרך Claude Vision. ניהול "תרומות ממתינות" לסליקת אשראי |
| **קמפיינים** | `app/(app)/campaigns/*` | ניהול קמפיין/תת-קמפיין עם שלושה טאבים: מיפוי (דירוג/קיבולת תורם מותאם אישית), הזמנה (סטטוס הזמנה + לוג שיחות), התרמה (מעקב יעד/גיוס בפועל, כולל רולאפ מתת-קמפיינים). הגדרות קהל יעד (מחלקה/רשימה ידנית) ותבניות מייל/פקס |
| **הגדרות** | `app/(app)/settings/*` | מיתוג (לוגו/כותרות דוח), ניהול משתמשים ותפקידים, סל מיחזור (soft-delete גנרי), יומן פעילות מערכתי, שדות/הצנעה/ערים/ייבוא אקסל לאנשי קשר, קטגוריות/מטפלים/ייצוא לתרומות |
| **הגדרות אישיות / פרופיל** | `personal-settings/*`, `profile/*` | ברירת מחדל אישית למוקד תשלום/מטבע, שינוי שם תצוגה |
| **צ'אט תמיכה** | `support-chat-actions.ts`, `SupportChatPanel.tsx` | צ'אט פנימי בין משתמש לצוות ניהול, עם הצעת תשובה אוטומטית ל-admin דרך Claude |
| **צ'אט AI** | `ai-chat-actions.ts`, `lib/ai/tools.ts`, `AIChatWidget.tsx` | עוזר AI צף בכל מסך. פעולות קריאה מתבצעות אוטומטית; פעולות כותבות (יצירה/עדכון/מחיקה של איש קשר/התחייבות/תרומה/קמפיין, שליחת מייל) חוזרות כ"פעולה ממתינה לאישור" שרק לאחריו קוראות לאותן server actions האמיתיות |
| **Webhook נדרים פלוס** | `app/api/nedarim-callback/route.ts` | הנקודה **היחידה** שבה תשלום כרטיס אשראי נשמר בפועל — ר' פירוט אבטחה למטה |
| **Webhook Twilio Voice** | `app/api/twilio-voice/route.ts` | מחזיר TwiML לגישור שיחה יוצאת; מוגדר בקונסולת Twilio כ-Voice Request URL, לא נקרא מקוד האפליקציה |
| **Cron תזכורות** | `app/api/cron/task-reminders/route.ts` | ריצה יומית (Vercel Cron) ששולחת מייל תזכורת חד-פעמי למשימות שהגיע זמנן |

## תלות בין המודולים

```
                        ┌─────────────────┐
                        │   contacts       │◄──────────────┐
                        └────────┬─────────┘                │
                                 │ (נתונים: pledges/donations)
                                 ▼                           │
┌──────────────┐        ┌──────────────────┐        ┌───────┴────────┐
│  campaigns    │◄──────►│  donations/pledges│◄──────►│  settings/trash │
└──────┬────────┘        └────────┬──────────┘        └────────────────┘
       │                          │
       │                          │ createDonationWithClient /
       │                          │ createPledgeWithPaymentUsingClient
       │                          ▼
       │                 ┌──────────────────────┐
       │                 │ nedarim-callback      │  (admin/service-role client,
       │                 │ (webhook, ללא session)│   נקרא ע"י שרתי נדרים פלוס)
       │                 └──────────────────────┘
       │
       ▼
┌──────────────┐   מנפיק טוקן   ┌──────────────┐
│ voice-actions │──────────────►│ twilio-voice  │  (webhook עצמאי, בלי imports
└──────────────┘   (בדפדפן)     │  (webhook)    │   פנימיים מלבד twilio)
                                └──────────────┘

┌──────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  ai-chat      │───────►│ contacts/donations│        │ cron/task-        │
│  (כלים כותבים  │  קורא   │ /campaigns actions│        │ reminders          │
│  = אישור ידני) │        │  (אותן פונקציות   │        │ ──► contacts       │
└──────────────┘        │   כמו הזנה ידנית) │        │ ──► email-actions  │
                        └──────────────────┘        └──────────────────┘
```

כל ה-`(app)` routes עטופים ב-middleware שדורש session מחובר; `/api/*` (שלושת ה-webhooks
למעלה) פטורים במפורש מהבדיקה הזו, כי הם נקראים משרתים חיצוניים (נדרים פלוס, Twilio,
Vercel Cron) ולא מהדפדפן של משתמש מחובר.

## משתני סביבה

| משתנה | חובה? | לשם מה |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **חובה** | חיבור בסיסי ל-Supabase (DB + Auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | חובה בפועל | מחיקת משתמשים, cron תזכורות, ה-webhook של נדרים פלוס (עוקף RLS) |
| `NEXT_PUBLIC_SITE_URL` | אופציונלי | קישור "מעבר לכרטיס איש קשר" במיילי תזכורת |
| `NEXT_PUBLIC_NEDARIM_MOSAD`, `NEXT_PUBLIC_NEDARIM_API_VALID` | חובה לתשלומי כרטיס | אייפרם סליקת נדרים פלוס |
| `NEXT_PUBLIC_NEDARIM_CALLBACK_ERROR_EMAIL` | אופציונלי | התראה אם callback נכשל לשלוח |
| `ANTHROPIC_API_KEY` | אופציונלי לפי-פיצ'ר | צ'אט AI, הצעת תשובה בצ'אט תמיכה, OCR שיקים - כל אחד מהם כבוי בנפרד בלעדיו |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | אופציונלי | מיילי קמפיין, דוח איש קשר, תזכורות cron |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID` | אופציונלי (חמישתם יחד) | שיחות VoIP מהדפדפן |
| `GOOGLE_MAPS_API_KEY` | אופציונלי | השלמת מיקוד אוטומטית |
| `CRON_SECRET` | **אופציונלי אך מומלץ מאוד** | ⚠️ בלעדיו נקודת הקצה `/api/cron/task-reminders` **פתוחה לחלוטין** - כל מי שיודע את הכתובת יכול להריץ אותה |

הסבר מפורט לכל משתנה נמצא ב-`.env.local.example`.

## שלב 1 — הקמת מסד הנתונים ב-Supabase

הסכמה מנוהלת כעת כ-migrations תחת `supabase/migrations/` (במקום קובץ `schema.sql` בודד) - כל שינוי עתידי בסכמה יתווסף כקובץ migration חדש (`npx supabase migration new <name>`), ולא ייערך ידנית בקובץ ישן.

**פרויקט Supabase חדש (ריק):**

1. בפרויקט ה-Supabase שלך: **SQL Editor → New query**.
2. הדבק את כל תוכן הקובץ `supabase/migrations/20250703000000_baseline.sql` והרץ (Run).
   - זה יוצר את הטבלאות `profiles`, `contacts`, `donations`, `audit_log`, ואת כללי ה-RLS לפי 5 התפקידים מהאפיון.
3. **Authentication → Users → Add user** — צור את המשתמש הראשון שלך (עצמך).
4. חזור ל-SQL Editor והרץ (עם ה-UUID של המשתמש שיצרת, מופיע בעמוד ה-Users):
   ```sql
   update profiles set role = 'admin' where id = '<PASTE-USER-UUID-HERE>';
   ```
   בלי זה, כל משתמש חדש נרשם אוטומטית בתפקיד "מזכירות".

**הפרויקט הקיים שלך (שכבר הורצה בו הסכמה הישנה ידנית):** הטבלאות כבר קיימות אצלך, אז אין להריץ את ה-baseline מחדש. כדי לעבור לניהול migrations דרך ה-CLI מבלי לגעת בנתונים הקיימים:

```bash
npx supabase login
npx supabase link --project-ref <YOUR-PROJECT-REF>
npx supabase migration repair --status applied 20250703000000
```

הפקודה `migration repair` רק מסמנת שה-migration הזו "כבר הורצה" בלי להריץ אותה שוב - כך `supabase db push` העתידי לא ינסה ליצור טבלאות שכבר קיימות. מכאן והלאה, כל migration חדש שתריץ עם `supabase migration new` יתעדכן אצלך עם `supabase db push`.

## שלב 2 — חיבור האפליקציה למסד

1. **Project Settings → API** בפרויקט Supabase — העתק את ה-`Project URL` וה-`anon public key`.
2. העתק את `.env.local.example` לקובץ בשם `.env.local` ומלא את שני הערכים.
3. אותם שני ערכים נדרשים גם ל-CI (`.github/workflows/ci.yml`, שמריץ typecheck/build/test על כל push ו-PR) - יש להגדיר אותם כ-`NEXT_PUBLIC_SUPABASE_URL` ו-`NEXT_PUBLIC_SUPABASE_ANON_KEY` תחת **Settings → Secrets and variables → Actions** ב-GitHub, בדיוק כמו ב-Vercel.

## שלב 3 — הרצה מקומית

```bash
npm install
npm run dev
```
פתח/י http://localhost:3000 — תועבר/י אוטומטית למסך התחברות.

בדיקות ותקינות טיפוסים (גם רצות אוטומטית ב-CI על כל push/PR, ר' `.github/workflows/ci.yml`):

```bash
npm test        # Vitest - 82 טסטים על לוגיקת הכסף (ר' "בדיקות" למטה)
npm run typecheck
```

## שלב 4 — פריסה ל-Vercel

1. העלה את התיקייה הזו ל-repository ב-GitHub (או גרור ל-Vercel דרך ה-CLI: `vercel`).
2. ב-Vercel: **New Project → Import** את ה-repo.
3. תחת **Environment Variables** הוסף את שני המשתנים מ-`.env.local`.
4. Deploy.

## מבנה הרשאות (RBAC)

| תפקיד | אנשי קשר | תרומות |
|---|---|---|
| מנהל מערכת | מלא | מלא |
| גזבר | מלא | מלא |
| מזכירות | הוספה/עדכון, ללא מחיקה | הוספה/עדכון, ללא מחיקה |
| רב | צפייה בלבד | צפייה בלבד |
| גבאי | צפייה בלבד | ללא גישה |

ההרשאות אוכפות **ברמת מסד הנתונים** (Row Level Security, כ-92 policies בסה"כ), לא רק
בממשק — כך שגם קריאה ישירה ל-API של Supabase כפופה להן. חשוב: מדובר בלוגיקת Postgres,
ולכן היא **לא** מכוסה ע"י חבילת ה-Vitest למטה (שרצה בלי מסד נתונים אמיתי) — בדיקה אמיתית
של ה-RLS דורשת Postgres מקומי (`supabase start`, צריך Docker) עם משתמשי בדיקה אמיתיים
לכל תפקיד.

## בדיקות

`npm test` מריץ 82 טסטים (Vitest) שמכסים את **לוגיקת הכסף**: חישובי יתרות/עודף, סנכרון
סטטוס התחייבות, המרת מטבע לפי שער בנק ישראל (נוכחי/היסטורי), רולאפ קמפיין-אב/תת-קמפיין,
וה-webhook של נדרים פלוס (IP allowlist, אידמפוטנטיות, התאמת סכום). לקוח Supabase מזויף
(`lib/testUtils/fakeSupabase.ts`) - בלי מסד נתונים אמיתי, בלי Docker. **לא מכוסה עדיין:**
RLS (ר' למעלה), טריגרים ב-DB (כמו שיוך `campaign_id` אוטומטי), הפקת PDF בפועל (רק חישוב
הסכומים שמוזנים אליו), ושני ה-webhooks האחרים (twilio-voice, cron/task-reminders).

## מה עדיין חסר

- **קבלה רשמית עם מספור רץ** — קיים דוח/מכתב PDF לאיש קשר (`contacts/report-actions.ts`)
  אבל זו לא קבלת מס רשמית עם מספור רץ וקבלה מרוכזת שנתית.
- **בדיקות RLS ו-webhooks נוספים** — ר' סעיף "בדיקות" למעלה.
- כל שאר המודולים שתוכננו במקור (דוחות, אוטומציה/תקשורת, טופס תרומה מקוון, ייבוא
  מאקסל) כבר בנויים בפועל — ר' "מודולים פעילים" למעלה.
