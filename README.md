# תרומיקס — מערכת ניהול תרומות ואנשי קשר (Next.js + Supabase)

מודול ליבה: **אנשי קשר** + **תרומות ותשלומים**, עם התחברות משתמשים והרשאות לפי תפקיד (RLS ברמת מסד הנתונים).

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

## שלב 3 — הרצה מקומית

```bash
npm install
npm run dev
```
פתח/י http://localhost:3000 — תועבר/י אוטומטית למסך התחברות.

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

ההרשאות אוכפות **ברמת מסד הנתונים** (Row Level Security), לא רק בממשק — כך שגם קריאה ישירה ל-API של Supabase כפופה להן.

## מה הלאה (לא כלול עדיין)

- **הפקת קבלות** (מודול 3) — כולל מספור רץ, PDF, וקבלה מרוכזת שנתית.
- **דוחות** (מודול 4).
- **אוטומציה ותקשורת** (מודול 5) — דורש שירות שליחת מיילים (למשל Resend) ו-Cron Job.
- **טופס תרומה מקוון** (מודול 6) — דורש חיבור לספק סליקה (Tranzila / Cardcom / PayPlus) דרך Webhook.
- **ייבוא מאקסל** של הנתונים הקיימים שלך — אפשר להוסיף מסך ייעודי (papaparse / xlsx) שממפה עמודות וכותב ל-`contacts`.

כל אחד מהם יכול להתווסף כמודול נפרד על גבי הבסיס הזה.
