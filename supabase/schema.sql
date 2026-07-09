-- =========================================================
-- תרומיקס — סכמת מסד נתונים (מודול ליבה: אנשי קשר + תרומות)
-- להריץ ב-Supabase: לוח בקרה > SQL Editor > New query > הדבקה והרצה
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. תפקידים (Roles) — טבלת פרופילים המקושרת למשתמשי האימות
-- ---------------------------------------------------------
create type user_role as enum ('admin', 'treasurer', 'secretary', 'rabbi', 'gabai');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role user_role not null default 'secretary',
  created_at timestamptz not null default now()
);

-- כאשר נרשם משתמש חדש ב-Supabase Auth, ליצור לו אוטומטית שורת פרופיל
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'secretary');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- פונקציית עזר: מהו התפקיד של המשתמש המחובר כרגע
create or replace function my_role()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- ---------------------------------------------------------
-- 2. אנשי קשר / תורמים
-- ---------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  spouse_name text,
  id_number text,
  phone text,
  email text,
  address text,
  contact_type text not null default 'תורם מזדמן'
    check (contact_type in ('חבר קבוע','תורם מזדמן','משפחה','עסק','אנונימי')),
  department text,
  status text not null default 'פעיל'
    check (status in ('פעיל','לא פעיל','נפטר','עבר עיר')),
  joined_date date default current_date,
  memorial_date date,
  tags text[] default '{}',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_name on contacts (last_name, first_name);
create index if not exists idx_contacts_status on contacts (status);

-- ---------------------------------------------------------
-- 3. תרומות ותשלומים
-- ---------------------------------------------------------
create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  donation_date date not null default current_date,
  purpose text not null default 'כללי',
  payment_method text not null default 'מזומן'
    check (payment_method in ('מזומן','צ''ק','כרטיס אשראי','העברה בנקאית','הוראת קבע','ביט')),
  recurrence text not null default 'חד-פעמי'
    check (recurrence in ('חד-פעמי','חודשי','רבעוני','שנתי')),
  status text not null default 'שולם'
    check (status in ('שולם','ממתין','נכשל','בוטל','מוחזר')),
  source text not null default 'הזנה ידנית'
    check (source in ('הזנה ידנית','טופס אתר','הוראת קבע אוטומטית')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_donations_contact on donations (contact_id);
create index if not exists idx_donations_date on donations (donation_date);
create index if not exists idx_donations_status on donations (status);

-- ---------------------------------------------------------
-- 4. יומן ביקורת (Audit Log) — לפעולות רגישות
-- ---------------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 5. updated_at אוטומטי
-- ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contacts_updated on contacts;
create trigger trg_contacts_updated before update on contacts
  for each row execute function set_updated_at();

drop trigger if exists trg_donations_updated on donations;
create trigger trg_donations_updated before update on donations
  for each row execute function set_updated_at();

-- =========================================================
-- 6. הרשאות ברמת שורה (RLS) — לפי מודל התפקידים באפיון
--    admin, treasurer : גישה מלאה
--    secretary        : צפייה/הוספה/עדכון, ללא מחיקה
--    rabbi             : צפייה בלבד
--    gabai              : צפייה באנשי קשר בלבד
-- =========================================================
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table donations enable row level security;
alter table audit_log enable row level security;

create policy "profiles_select_all" on profiles for select
  to authenticated using (true);
create policy "profiles_update_self_or_admin" on profiles for update
  to authenticated using (id = auth.uid() or my_role() = 'admin');

-- contacts
create policy "contacts_select" on contacts for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi','gabai'));

create policy "contacts_insert" on contacts for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

create policy "contacts_update" on contacts for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

create policy "contacts_delete" on contacts for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- donations
create policy "donations_select" on donations for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));

create policy "donations_insert" on donations for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

create policy "donations_update" on donations for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

create policy "donations_delete" on donations for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- audit_log: רק אדמין/גזבר יכולים לצפות
create policy "audit_select" on audit_log for select
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- 7. הרחבת פרטי איש קשר + הגדרת שדות מוצגים במסך
--    *** קטע חדש בלבד — אם כבר הרצת את הקובץ בעבר, מספיק
--    להריץ מכאן והלאה, אין צורך להריץ שוב את מה שלפני זה ***
-- =========================================================

-- כללי
alter table contacts add column if not exists title text; -- תואר

-- מגורים
alter table contacts add column if not exists street text; -- רחוב
alter table contacts add column if not exists house_number text; -- מספר
alter table contacts add column if not exists city text; -- עיר
alter table contacts add column if not exists country text; -- ארץ (נגזר אוטומטית מהעיר)
alter table contacts add column if not exists postal_code text; -- מיקוד

-- פרטי קשר נוספים (הטלפון הראשי memoized בעמודה הקיימת phone)
alter table contacts add column if not exists mobile_secondary text; -- סלולארי נוסף
alter table contacts add column if not exists home_phone text; -- טלפון בית
alter table contacts add column if not exists wife_mobile text; -- פלאפון נשים
alter table contacts add column if not exists email_secondary text; -- אימייל נוסף

-- פרטים נוספים
alter table contacts add column if not exists full_name_with_mother text; -- שם מלא עם שם האם
alter table contacts add column if not exists full_name_with_father text; -- שם מלא עם שם האב
alter table contacts add column if not exists mailing_name text; -- שם לדיוור

-- הסלולארי הראשי הופך למזהה: שדה חובה וייחודי.
-- אם יש כבר אנשי קשר ללא טלפון או עם טלפון כפול, השורות הבאות ייכשלו —
-- יש לעדכן ידנית את הרשומות הבעייתיות לפני ההרצה החוזרת של שתי השורות הבאות:
--   select id, first_name, last_name from contacts where phone is null;
--   select phone, count(*) from contacts group by phone having count(*) > 1;
alter table contacts alter column phone set not null;
alter table contacts add constraint contacts_phone_unique unique (phone);

-- ---------------------------------------------------------
-- הגדרת שדות מוצגים במסך אנשי הקשר (טבלת הגדרות יחידה למערכת)
-- ---------------------------------------------------------
create table if not exists contact_field_settings (
  id boolean primary key default true check (id),
  visible_fields text[] not null default array[
    'phone','first_name','last_name','email','contact_type','department','status','tags'
  ],
  updated_at timestamptz not null default now()
);
insert into contact_field_settings (id) values (true) on conflict (id) do nothing;

alter table contact_field_settings enable row level security;

drop policy if exists "field_settings_select" on contact_field_settings;
create policy "field_settings_select" on contact_field_settings for select
  to authenticated using (true);

drop policy if exists "field_settings_update" on contact_field_settings;
create policy "field_settings_update" on contact_field_settings for update
  to authenticated using (my_role() = 'admin');

drop trigger if exists trg_field_settings_updated on contact_field_settings;
create trigger trg_field_settings_updated before update on contact_field_settings
  for each row execute function set_updated_at();

-- =========================================================
-- 8. עדכון רשימת הסטטוסים המותרים לאיש קשר
--    *** קטע חדש בלבד — כמו קטע 7, מריצים רק אותו ***
--    לפני ההרצה, ודאו שאין רשומות עם סטטוס ישן שלא ברשימה החדשה:
--      select id, first_name, last_name, status from contacts
--        where status not in ('פעיל','לא פעיל','ממתין לאישור','לא ידוע');
--    אם יש תוצאות, עדכנו אותן ידנית לערך מהרשימה החדשה, למשל:
--      update contacts set status = 'לא ידוע' where status in ('נפטר','עבר עיר');
-- =========================================================
do $$
declare
  cons_name text;
begin
  select conname into cons_name
  from pg_constraint
  where conrelid = 'contacts'::regclass
    and pg_get_constraintdef(oid) ilike '%status%';
  if cons_name is not null then
    execute format('alter table contacts drop constraint %I', cons_name);
  end if;
end $$;

alter table contacts add constraint contacts_status_check
  check (status in ('פעיל','לא פעיל','ממתין לאישור','לא ידוע'));

-- =========================================================
-- 9. הגדרה: הצגה/הסתרה של אנשי קשר לא פעילים במסך הרשימה
--    *** קטע חדש בלבד ***
-- =========================================================
alter table contact_field_settings add column if not exists show_inactive boolean not null default true;

-- =========================================================
-- 10. שיוך למחלקה הופך לשדה חובה באיש קשר
--    *** קטע חדש בלבד ***
--    לפני ההרצה, ודאו שאין רשומות בלי מחלקה, ואם יש - עדכנו אותן:
--      select id, first_name, last_name from contacts where department is null;
--      update contacts set department = 'תורמים מזדמנים' where department is null;
-- =========================================================
alter table contacts alter column department set default 'תורמים מזדמנים';
alter table contacts alter column department set not null;

-- =========================================================
-- 11. נדרים (Pledges) — התחייבויות לתרומה, נפרד מתשלומים בפועל
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists pledges (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete restrict,
  category text,
  pledge_type text not null default 'תרומה חד"פ'
    check (pledge_type in ('תרומה חד"פ','הוראת קבע')),
  currency text not null default '₪'
    check (currency in ('₪','$','€','£','CHF')),
  amount numeric(12,2) not null check (amount > 0),
  details text,
  pledge_date date not null default current_date,
  follow_up text,
  handler text,
  status text not null default 'פתוח'
    check (status in ('פתוח','שולם','שולם חלקית','בוטל')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pledges_contact on pledges (contact_id);
create index if not exists idx_pledges_status on pledges (status);

drop trigger if exists trg_pledges_updated on pledges;
create trigger trg_pledges_updated before update on pledges
  for each row execute function set_updated_at();

alter table pledges enable row level security;

drop policy if exists "pledges_select" on pledges;
create policy "pledges_select" on pledges for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));

drop policy if exists "pledges_insert" on pledges;
create policy "pledges_insert" on pledges for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

drop policy if exists "pledges_update" on pledges;
create policy "pledges_update" on pledges for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

drop policy if exists "pledges_delete" on pledges;
create policy "pledges_delete" on pledges for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- 12. תרומות: קישור אופציונלי לנדר, מטבע ומוקד תשלום
--    *** קטע חדש בלבד ***
-- =========================================================
alter table donations add column if not exists pledge_id uuid references pledges(id) on delete set null;
alter table donations add column if not exists currency text not null default '₪'
  check (currency in ('₪','$','€','£','CHF'));
alter table donations add column if not exists payment_hub text
  check (payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ'));

create index if not exists idx_donations_pledge on donations (pledge_id);

-- =========================================================
-- 13. קטגוריות ומטפלים לתרומות/נדרים — רשימות מנוהלות דרך הגדרות
--    *** קטע חדש בלבד ***
--    הערה: השדות category/handler בטבלאות pledges/donations הם טקסט חופשי
--    (לא מפתח זר) - כך שמחיקת קטגוריה/מטפל מהרשימה לא משפיעה על רשומות קיימות.
-- =========================================================
create table if not exists donation_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
insert into donation_categories (name)
  values ('כללי'), ('בניין'), ('כשרות'), ('חינוך'), ('ביקור חולים'), ('אחר')
  on conflict (name) do nothing;

alter table donation_categories enable row level security;

drop policy if exists "donation_categories_select" on donation_categories;
create policy "donation_categories_select" on donation_categories for select
  to authenticated using (true);

drop policy if exists "donation_categories_insert" on donation_categories;
create policy "donation_categories_insert" on donation_categories for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_categories_delete" on donation_categories;
create policy "donation_categories_delete" on donation_categories for delete
  to authenticated using (my_role() in ('admin','treasurer'));

create table if not exists donation_handlers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table donation_handlers enable row level security;

drop policy if exists "donation_handlers_select" on donation_handlers;
create policy "donation_handlers_select" on donation_handlers for select
  to authenticated using (true);

drop policy if exists "donation_handlers_insert" on donation_handlers;
create policy "donation_handlers_insert" on donation_handlers for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_handlers_delete" on donation_handlers;
create policy "donation_handlers_delete" on donation_handlers for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- 14. המשך טיפול הופך לתאריך (היה טקסט חופשי)
--    *** קטע חדש בלבד ***
-- =========================================================
alter table pledges alter column follow_up type date
  using (case when follow_up ~ '^\d{4}-\d{2}-\d{2}$' then follow_up::date else null end);

-- =========================================================
-- 15. הרחבת רשימת המטבעות הנתמכים (דולר קנדי + מטבעות נוספים)
--    *** קטע חדש בלבד ***
-- =========================================================
alter table pledges drop constraint if exists pledges_currency_check;
alter table pledges add constraint pledges_currency_check
  check (currency in ('₪','$','€','£','CHF','CAD','JPY','AUD','DKK','NOK','ZAR','SEK','JOD','LBP','EGP'));

alter table donations drop constraint if exists donations_currency_check;
alter table donations add constraint donations_currency_check
  check (currency in ('₪','$','€','£','CHF','CAD','JPY','AUD','DKK','NOK','ZAR','SEK','JOD','LBP','EGP'));

-- =========================================================
-- 16. מוקד תשלום ברירת מחדל אישי, פרטי העברה בנקאית ותאריך המשך
--     טיפול לתשלומים, וניהול סדר/פעילות לקטגוריות ולמטפלים
--    *** קטע חדש בלבד ***
-- =========================================================
alter table profiles add column if not exists default_payment_hub text not null default 'ישראל'
  check (default_payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ'));

alter table donations add column if not exists follow_up date;
alter table donations add column if not exists bank_name text;
alter table donations add column if not exists branch_number text;
alter table donations add column if not exists account_number text;

alter table donation_categories add column if not exists active boolean not null default true;
alter table donation_categories add column if not exists sort_order integer not null default 0;
alter table donation_handlers add column if not exists active boolean not null default true;
alter table donation_handlers add column if not exists sort_order integer not null default 0;

with ordered as (
  select id, row_number() over (order by name) as rn from donation_categories
)
update donation_categories c set sort_order = ordered.rn from ordered where c.id = ordered.id and c.sort_order = 0;

with ordered as (
  select id, row_number() over (order by name) as rn from donation_handlers
)
update donation_handlers h set sort_order = ordered.rn from ordered where h.id = ordered.id and h.sort_order = 0;

drop policy if exists "donation_categories_update" on donation_categories;
create policy "donation_categories_update" on donation_categories for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop policy if exists "donation_handlers_update" on donation_handlers;
create policy "donation_handlers_update" on donation_handlers for update
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- 17. פרטי צ'ק (מספר שיק, תאריך הצ'ק) לתשלומים באמצעי "צ'ק"
--    *** קטע חדש בלבד ***
-- =========================================================
alter table donations add column if not exists check_number text;
alter table donations add column if not exists check_date date;

-- =========================================================
-- 18. מטבע קלט ברירת מחדל אישי למשתמש
--    *** קטע חדש בלבד ***
-- =========================================================
alter table profiles add column if not exists default_currency text not null default '₪'
  check (default_currency in ('₪','$','€','£','CHF','CAD','JPY','AUD','DKK','NOK','ZAR','SEK','JOD','LBP','EGP'));

-- =========================================================
-- 19. פרטי המשך טיפול (טקסט חופשי) לתשלומים, לצד תאריך המשך הטיפול
--    *** קטע חדש בלבד ***
-- =========================================================
alter table donations add column if not exists follow_up_details text;

-- =========================================================
-- 20. שורות פירוט לתשלום מפוצל (מספר שיקים / מספר העברות בתשלום אחד)
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists donation_payment_lines (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  bank_name text,
  branch_number text,
  account_number text,
  check_number text,
  check_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_donation_payment_lines_donation on donation_payment_lines (donation_id);

alter table donation_payment_lines enable row level security;

drop policy if exists "donation_payment_lines_select" on donation_payment_lines;
create policy "donation_payment_lines_select" on donation_payment_lines for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));

drop policy if exists "donation_payment_lines_insert" on donation_payment_lines;
create policy "donation_payment_lines_insert" on donation_payment_lines for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

drop policy if exists "donation_payment_lines_delete" on donation_payment_lines;
create policy "donation_payment_lines_delete" on donation_payment_lines for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- 21. הגדרת שדות מוצגים במסך תרומות ותשלומים (טבלת הגדרות יחידה למערכת)
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists donation_field_settings (
  id boolean primary key default true check (id),
  visible_fields text[] not null default array['date','phone','payment_method','handler'],
  updated_at timestamptz not null default now()
);
insert into donation_field_settings (id) values (true) on conflict (id) do nothing;

alter table donation_field_settings enable row level security;

drop policy if exists "donation_field_settings_select" on donation_field_settings;
create policy "donation_field_settings_select" on donation_field_settings for select
  to authenticated using (true);

drop policy if exists "donation_field_settings_update" on donation_field_settings;
create policy "donation_field_settings_update" on donation_field_settings for update
  to authenticated using (my_role() = 'admin');

drop trigger if exists trg_donation_field_settings_updated on donation_field_settings;
create trigger trg_donation_field_settings_updated before update on donation_field_settings
  for each row execute function set_updated_at();

-- =========================================================
-- 22. הוספת מוקד תשלום "בלגיה" - עדכון אילוצי הבדיקה שהגבילו לרשימה הישנה
--    *** קטע חדש בלבד ***
-- =========================================================
alter table donations drop constraint if exists donations_payment_hub_check;
alter table donations add constraint donations_payment_hub_check
  check (payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ','בלגיה'));

alter table profiles drop constraint if exists profiles_default_payment_hub_check;
alter table profiles add constraint profiles_default_payment_hub_check
  check (default_payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ','בלגיה'));

-- =========================================================
-- 23. מוקד תשלום גם על התחייבות (זרימה 1: התחייבות בלבד, ללא תשלום מיידי)
--    *** קטע חדש בלבד ***
-- =========================================================
alter table pledges add column if not exists payment_hub text;
alter table pledges drop constraint if exists pledges_payment_hub_check;
alter table pledges add constraint pledges_payment_hub_check
  check (payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ','בלגיה'));

-- =========================================================
-- 24. מחיקה רכה של אנשי קשר (עם אפשרות שחזור דרך הגדרות)
--    *** קטע חדש בלבד ***
-- =========================================================
alter table contacts add column if not exists deleted_at timestamptz;

-- =========================================================
-- 25. רשימת ערים מנוהלת (עיר + ארץ) לאימות שדה העיר בטופס איש קשר
--    והשלמת הארץ אוטומטית; ניתנת לניהול דרך הגדרות > אנשי קשר > ערים
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists contact_cities (
  id uuid primary key default gen_random_uuid(),
  city text not null unique,
  country text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table contact_cities enable row level security;

drop policy if exists "contact_cities_select" on contact_cities;
create policy "contact_cities_select" on contact_cities for select using (true);

drop policy if exists "contact_cities_write" on contact_cities;
create policy "contact_cities_write" on contact_cities for all using (my_role() = 'admin') with check (my_role() = 'admin');

insert into contact_cities (city, country, sort_order) values
  ('אלעד', 'ארץ ישראל', 1),
  ('אשדוד', 'ארץ ישראל', 2),
  ('בית שמש', 'ארץ ישראל', 3),
  ('ביתר עילית', 'ארץ ישראל', 4),
  ('בני ברק', 'ארץ ישראל', 5),
  ('בת ים', 'ארץ ישראל', 6),
  ('חיפה', 'ארץ ישראל', 7),
  ('ירושלים', 'ארץ ישראל', 8),
  ('מודיעין עילית', 'ארץ ישראל', 9),
  ('מושב גמזו', 'ארץ ישראל', 10),
  ('נוף הגליל', 'ארץ ישראל', 11),
  ('נתניה', 'ארץ ישראל', 12),
  ('צפת', 'ארץ ישראל', 13),
  ('קרית גת', 'ארץ ישראל', 14),
  ('רחובות', 'ארץ ישראל', 15),
  ('תל אביב-יפו', 'ארץ ישראל', 16),
  ('פתח תקווה', 'ארץ ישראל', 17),
  ('טבריה עילית', 'ארץ ישראל', 18),
  ('Melbourne Victorie', 'Australia', 19),
  ('Vienna', 'Austria', 20),
  ('Antwerp', 'Belgium', 21),
  ('Toronto, Ontario', 'Canada', 22),
  ('Montreal Quebec', 'Canada', 23),
  ('Gateshead', 'England', 24),
  ('London', 'England', 25),
  ('Salford Manchester', 'England', 26),
  ('Edgware', 'England', 27),
  ('Canvey Island', 'England', 28),
  ('Zurich', 'Switzerland', 29),
  ('Brooklyn N.Y.', 'U.S.A.', 30),
  ('Williamsburg', 'U.S.A.', 31),
  ('Los Angeles CA.', 'U.S.A.', 32),
  ('Lawrence N.Y.', 'U.S.A.', 33),
  ('Linden N.J.', 'U.S.A.', 34),
  ('Lakewood N.J.', 'U.S.A.', 35),
  ('Monsey N.Y.', 'U.S.A.', 36),
  ('New Square N.Y.', 'U.S.A.', 37),
  ('Spring Valley N.Y.', 'U.S.A.', 38),
  ('Staten Island', 'U.S.A.', 39)
on conflict (city) do nothing;

-- =========================================================
-- 26. אישור מנהל למשתמשים חדשים (הרשמה עם מייל/סיסמה או עם Google) -
--    משתמש חדש נכנס במצב "ממתין לאישור" ואינו יכול להיכנס למערכת
--    עד שמנהל מאשר אותו וקובע לו תפקיד. משתמשים קיימים "מאושרים"
--    אוטומטית (ברירת המחדל של העמודה בשורות קיימות היא true).
--    *** קטע חדש בלבד ***
-- =========================================================
alter table profiles add column if not exists approved boolean not null default true;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    'secretary',
    false
  );
  return new;
end;
$$ language plpgsql security definer;

-- =========================================================
-- 27. חיזוק אבטחה: "ממתין לאישור" נאכף גם ברמת ה-RLS, לא רק במסך
--    האפליקציה. my_role() תחזיר NULL למשתמש שעדיין לא אושר, וכך כל
--    מדיניות RLS קיימת שבודקת my_role() in (...) תיכשל אוטומטית
--    עבורו (NULL in (...) הוא NULL, כלומר לא-אמת) - בלי לגעת בכל
--    מדיניות בנפרד. כך משתמש שנרשם וחסום במסך לא יכול גם לעקוף את
--    זה ולפנות ישירות ל-API של Supabase עם ה-token שלו.
--    *** קטע חדש בלבד ***
-- =========================================================
create or replace function my_role()
returns user_role as $$
  select role from profiles where id = auth.uid() and approved = true;
$$ language sql stable security definer;

-- =========================================================
-- 28. "מנהל ראשי" (super admin) - היחיד שרואי/מורשה למחוק חשבונות
--    משתמשים לצמיתות (פעולה הרסנית ששמורה למי שמוגדר ככזה בלבד)
--    *** קטע חדש בלבד ***
-- =========================================================
alter table profiles add column if not exists is_super_admin boolean not null default false;

-- =========================================================
-- 29. מחיקה רכה + מעקב "מי מחק" עבור תרומות/התחייבויות/קטגוריות/
--    מטפלים/ערים (אנשי קשר כבר תמכו במחיקה רכה - כאן מוסיפים להם
--    deleted_by גם כן), לצורך "פח מחזור" מאוחד בהגדרות
--    *** קטע חדש בלבד ***
-- =========================================================
alter table contacts add column if not exists deleted_by uuid references auth.users(id);

alter table donations add column if not exists deleted_at timestamptz;
alter table donations add column if not exists deleted_by uuid references auth.users(id);

alter table pledges add column if not exists deleted_at timestamptz;
alter table pledges add column if not exists deleted_by uuid references auth.users(id);

alter table donation_categories add column if not exists deleted_at timestamptz;
alter table donation_categories add column if not exists deleted_by uuid references auth.users(id);

alter table donation_handlers add column if not exists deleted_at timestamptz;
alter table donation_handlers add column if not exists deleted_by uuid references auth.users(id);

alter table contact_cities add column if not exists deleted_at timestamptz;
alter table contact_cities add column if not exists deleted_by uuid references auth.users(id);

-- =========================================================
-- 30. קבצים מצורפים לכרטיס איש קשר - טבלה + Storage bucket
--    (חוזים, תעודות, מסמכים סרוקים וכו') המשויכים לכרטיס
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists contact_files (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint,
  content_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

alter table contact_files enable row level security;

create policy "contact_files_select" on contact_files for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi','gabai'));

create policy "contact_files_insert" on contact_files for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

create policy "contact_files_delete" on contact_files for delete
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

insert into storage.buckets (id, name, public)
values ('contact-files', 'contact-files', false)
on conflict (id) do nothing;

create policy "contact_files_storage_select" on storage.objects for select
  to authenticated using (bucket_id = 'contact-files' and my_role() in ('admin','treasurer','secretary','rabbi','gabai'));

create policy "contact_files_storage_insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'contact-files' and my_role() in ('admin','treasurer','secretary'));

create policy "contact_files_storage_delete" on storage.objects for delete
  to authenticated using (bucket_id = 'contact-files' and my_role() in ('admin','treasurer','secretary'));

-- =========================================================
-- 31. תיקון: מדיניות RLS חסרה עבור עדכון (UPDATE) בטבלת contact_files -
--    מחיקה רכה של קובץ היא בפועל UPDATE (קביעת deleted_at), ובלי מדיניות
--    "for update" הפעולה נחסמת בשקט (0 שורות מושפעות, ללא שגיאה) - זו
--    הסיבה שכפתור מחיקת קובץ לא עבד בפועל
--    *** קטע חדש בלבד ***
-- =========================================================
create policy "contact_files_update" on contact_files for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'))
  with check (my_role() in ('admin','treasurer','secretary'));

-- =========================================================
-- 32. כללי הרשאה לפי תגית - הגבלת צפייה באיש קשר, ניתנות לשילוב באותו כלל:
--    הסתרת הכרטיס כולו, ו/או הסתרת שדות ספציפיים, ו/או הסתרת אזורים
--    (תרומות/התחייבויות, קבצים מצורפים) - עבור תפקיד שלם או משתמש ספציפי.
--    הסתרת "כרטיס שלם" נאכפת ב-RLS (חסימה אמיתית, לא ניתנת לעקיפה); הסתרת
--    שדות/אזורים נאכפת ברמת האפליקציה (lib/contactVisibility.ts) בעת שליפת
--    הנתונים - מגינה על התצוגה הרגילה אך אינה מונעת עדכון ישיר ברמת ה-DB.
--    *** קטע מתוקן - בטוח להריץ שוב גם אם כבר הרצת גרסה קודמת של קטע זה ***
-- =========================================================
create table if not exists contact_visibility_rules (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  scope_type text not null check (scope_type in ('role','user')),
  role text check (role is null or role in ('admin','treasurer','secretary','rabbi','gabai')),
  user_id uuid references auth.users(id),
  hide_contact boolean not null default false,
  hidden_fields text[],
  hidden_sections text[],
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- תוספת עמודות במידה והטבלה נוצרה בעבר לפי גרסה קודמת (עם restriction_type בלבד)
alter table contact_visibility_rules add column if not exists hide_contact boolean not null default false;
alter table contact_visibility_rules add column if not exists hidden_sections text[];

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'contact_visibility_rules' and column_name = 'restriction_type'
  ) then
    update contact_visibility_rules set hide_contact = true where restriction_type = 'hide_contact';
    alter table contact_visibility_rules drop column restriction_type;
  end if;
end $$;

alter table contact_visibility_rules drop constraint if exists contact_visibility_rules_check;
alter table contact_visibility_rules drop constraint if exists contact_visibility_rules_check1;

alter table contact_visibility_rules drop constraint if exists contact_visibility_rules_scope_check;
alter table contact_visibility_rules add constraint contact_visibility_rules_scope_check check (
  (scope_type = 'role' and role is not null and user_id is null)
  or (scope_type = 'user' and user_id is not null and role is null)
);

alter table contact_visibility_rules drop constraint if exists contact_visibility_rules_hidden_check;
alter table contact_visibility_rules add constraint contact_visibility_rules_hidden_check check (
  hide_contact
  or (hidden_fields is not null and array_length(hidden_fields, 1) > 0)
  or (hidden_sections is not null and array_length(hidden_sections, 1) > 0)
);

alter table contact_visibility_rules drop constraint if exists contact_visibility_rules_sections_check;
alter table contact_visibility_rules add constraint contact_visibility_rules_sections_check check (
  hidden_sections is null or hidden_sections <@ array['donations','files']::text[]
);

alter table contact_visibility_rules enable row level security;

-- קריאה מותרת לכל משתמש מאושר (נשלף רק בקוד השרת לצורך חישוב redaction - הרשימה עצמה
-- אינה נשלחת אף פעם לדפדפן), ניהול (הוספה/מחיקה) מותר למנהל מערכת בלבד
drop policy if exists "contact_visibility_rules_select" on contact_visibility_rules;
create policy "contact_visibility_rules_select" on contact_visibility_rules for select
  to authenticated using (my_role() is not null);

drop policy if exists "contact_visibility_rules_insert" on contact_visibility_rules;
create policy "contact_visibility_rules_insert" on contact_visibility_rules for insert
  to authenticated with check (my_role() = 'admin');

drop policy if exists "contact_visibility_rules_delete" on contact_visibility_rules;
create policy "contact_visibility_rules_delete" on contact_visibility_rules for delete
  to authenticated using (my_role() = 'admin');

-- הרחבת מדיניות הצפייה באנשי קשר: מנהל מערכת תמיד רואה הכל (כדי שלא ינעל את עצמו
-- בטעות בעת הגדרת כלל), שאר התפקידים נחסמים מכרטיס שהוגדר לגביו כלל hide_contact
-- התואם לתפקיד שלהם או למשתמש הספציפי שלהם, כאשר אחת מתגיות איש הקשר תואמת לכלל.
-- שימו לב ל-::text: my_role() מחזירה טיפוס enum (user_role) ולא text, ולכן השוואה
-- ישירה לעמודת role (מסוג text) דורשת המרה מפורשת - זו הייתה סיבת השגיאה בהרצה הקודמת
drop policy if exists "contacts_select" on contacts;
create policy "contacts_select" on contacts for select
  to authenticated using (
    my_role() = 'admin'
    or (
      my_role() in ('treasurer','secretary','rabbi','gabai')
      and not exists (
        select 1 from contact_visibility_rules r
        where r.hide_contact
          and r.tag = any(contacts.tags)
          and (
            (r.scope_type = 'role' and r.role = my_role()::text)
            or (r.scope_type = 'user' and r.user_id = auth.uid())
          )
      )
    )
  );

-- =========================================================
-- 33. קמפיינים - שכבה מצטברת מעל התחייבויות/תשלומים קיימים, לא הנהלת
--    חשבונות מקבילה. קמפיין הוא ישות מלאה בפני עצמה (יעד, מטבע, תאריכים,
--    סטטוס) שיכולה להיות "קמפיין-אב" (parent_campaign_id ריק) או
--    "תת-קמפיין" השייך לקמפיין-אב אחד (רמת קינון אחת בלבד - לא ניתן
--    לשייך תת-קמפיין לקמפיין שהוא עצמו תת-קמפיין). קמפיין-אב מציג את סך
--    הסכומים ששויכו אליו ישירות + סך כל תתי-הקמפיינים שלו יחד. כל
--    התחייבות/תשלום משויכים לכל היותר לצומת אחד בהיררכיה, דרך עמודת
--    campaign_id על pledges/donations (ריק = תרומה שוטפת רגילה, ללא שינוי
--    בהתנהגות הקיימת).
--    *** קטע חדש בלבד ***
-- =========================================================
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  parent_campaign_id uuid references campaigns(id) on delete set null,
  goal_amount numeric(12,2) check (goal_amount is null or goal_amount > 0),
  goal_currency text not null default '₪'
    check (goal_currency in ('₪','$','€','£','CHF','CAD','JPY','AUD','DKK','NOK','ZAR','SEK','JOD','LBP','EGP')),
  start_date date,
  end_date date,
  status text not null default 'פעיל' check (status in ('פעיל','הושלם','בארכיון')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create index if not exists idx_campaigns_parent on campaigns (parent_campaign_id);

drop trigger if exists trg_campaigns_updated on campaigns;
create trigger trg_campaigns_updated before update on campaigns
  for each row execute function set_updated_at();

-- שיוך אופציונלי של התחייבות/תשלום לקמפיין (או תת-קמפיין) ספציפי
alter table pledges add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table donations add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_pledges_campaign on pledges (campaign_id);
create index if not exists idx_donations_campaign on donations (campaign_id);

alter table campaigns enable row level security;

drop policy if exists "campaigns_select" on campaigns;
create policy "campaigns_select" on campaigns for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));

drop policy if exists "campaigns_insert" on campaigns;
create policy "campaigns_insert" on campaigns for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));

drop policy if exists "campaigns_update" on campaigns;
create policy "campaigns_update" on campaigns for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

drop policy if exists "campaigns_delete" on campaigns;
create policy "campaigns_delete" on campaigns for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- אוכף רמת קינון אחת בלבד: קמפיין-האב הנבחר כ-parent_campaign_id חייב להיות
-- הוא עצמו קמפיין-אב (parent_campaign_id ריק) - הגנה ברמת ה-DB בנוסף להגבלה
-- המקבילה שתיאכף גם בממשק (רשימת הבחירה תציג רק קמפייני-אב כאפשרות "אב")
create or replace function enforce_campaign_single_level()
returns trigger as $$
begin
  if new.parent_campaign_id is not null and exists (
    select 1 from campaigns where id = new.parent_campaign_id and parent_campaign_id is not null
  ) then
    raise exception 'לא ניתן לשייך תת-קמפיין לקמפיין שהוא עצמו תת-קמפיין (נתמכת רמת קינון אחת בלבד)';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_campaigns_single_level on campaigns;
create trigger trg_campaigns_single_level before insert or update on campaigns
  for each row execute function enforce_campaign_single_level();

-- =========================================================
-- 34. שיוך אוטומטי לקמפיין דרך שדה הקטגוריה: כל קמפיין/תת-קמפיין יוצר
--    אוטומטית קטגוריית תרומה תואמת (בשם הקמפיין + הסיומת "(קמפיין)"), ובחירת
--    אותה קטגוריה בטופס הוספת תרומה/התחייבות משייכת את הרשומה לקמפיין
--    אוטומטית - אין צורך בשדה נפרד לבחירת קמפיין בטופס הקיים.
--    *** קטע חדש בלבד ***
-- =========================================================
alter table donation_categories add column if not exists campaign_id uuid references campaigns(id) on delete set null;
create unique index if not exists idx_donation_categories_campaign_unique
  on donation_categories (campaign_id) where campaign_id is not null;

-- יוצר/מעדכן את קטגוריית התרומה המשויכת לקמפיין בכל הוספה/עדכון של קמפיין (שם +
-- מצב פעיל בהתאם לסטטוס המחיקה הרכה של הקמפיין). שימוש ב-ON CONFLICT (name) כדי
-- לא להיכשל אם קיימת כבר קטגוריה בשם זהה במקרה נדיר של התנגשות שמות בין קמפיינים
create or replace function sync_campaign_category()
returns trigger as $$
declare
  cat_name text;
begin
  cat_name := new.name || ' (קמפיין)';
  if tg_op = 'INSERT' then
    insert into donation_categories (name, campaign_id, active, sort_order)
    values (cat_name, new.id, new.deleted_at is null, (select coalesce(max(sort_order), 0) + 1 from donation_categories))
    on conflict (name) do update set campaign_id = excluded.campaign_id, active = excluded.active;
  else
    update donation_categories set name = cat_name, active = (new.deleted_at is null)
    where campaign_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_campaigns_sync_category on campaigns;
create trigger trg_campaigns_sync_category after insert or update on campaigns
  for each row execute function sync_campaign_category();

-- לפני שמירת התחייבות/תשלום: אם הקטגוריה שנבחרה (category עבור pledges, purpose
-- עבור donations) תואמת קטגוריה שנוצרה מקמפיין, ה-campaign_id מוגדר בהתאם;
-- אחרת מנוקה לריק (כך שהחלפת קטגוריה מעדכנת את השיוך אוטומטית, גם בעריכה)
create or replace function sync_pledge_campaign()
returns trigger as $$
begin
  select campaign_id into new.campaign_id from donation_categories where name = new.category limit 1;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pledges_sync_campaign on pledges;
create trigger trg_pledges_sync_campaign before insert or update on pledges
  for each row execute function sync_pledge_campaign();

create or replace function sync_donation_campaign()
returns trigger as $$
begin
  select campaign_id into new.campaign_id from donation_categories where name = new.purpose limit 1;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_donations_sync_campaign on donations;
create trigger trg_donations_sync_campaign before insert or update on donations
  for each row execute function sync_donation_campaign();

-- =========================================================
-- 35. ניהול התרמה לקמפיין: מיפוי אנשי קשר (יעד/פוטנציאל/ממדי דירוג
--    מותאמים-אישית עם דרגות מוגדרות לכל קמפיין), סטטוס תהליך קבוע אחד לכל
--    המערכת, ומרכזיית טלפנות (תיעוד שיחות + תזכורות) משויכת לקמפיין - עם
--    אפשרות לעיין בהיסטוריה חוצת-קמפיינים של אותו איש קשר (שליפה לפי
--    contact_id בלבד, ללא סינון לפי campaign_id).
--    *** קטע חדש בלבד ***
-- =========================================================

-- מיפוי איש קשר עבור קמפיין ספציפי: יעד גיוס, פוטנציאל, וסטטוס תהליך
create table if not exists campaign_contact_mappings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  target_amount numeric(12,2),
  potential_amount numeric(12,2),
  status text not null default 'טרם טופל'
    check (status in ('טרם טופל','נוצר קשר','בתהליך','התחייב','שילם','סירב','לא רלוונטי')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists idx_campaign_mappings_campaign on campaign_contact_mappings (campaign_id);
create index if not exists idx_campaign_mappings_contact on campaign_contact_mappings (contact_id);

drop trigger if exists trg_campaign_mappings_updated on campaign_contact_mappings;
create trigger trg_campaign_mappings_updated before update on campaign_contact_mappings
  for each row execute function set_updated_at();

-- ממדי דירוג מותאמים-אישית לקמפיין (למשל "יכולת כלכלית" בקמפיין אחד, "זיקה
-- לקהילה" באחר) - כל ממד מוגדר ע"י מנהל הקמפיין עם רשימת הדרגות (תפריט נפתח)
-- הספציפית שלו
create table if not exists campaign_mapping_dimensions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists campaign_mapping_dimension_levels (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references campaign_mapping_dimensions(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create index if not exists idx_campaign_dimensions_campaign on campaign_mapping_dimensions (campaign_id);
create index if not exists idx_campaign_dimension_levels_dimension on campaign_mapping_dimension_levels (dimension_id);

-- הדרגה שנבחרה לאיש קשר בממד מסוים, עבור מיפוי קמפיין ספציפי
create table if not exists campaign_contact_dimension_scores (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references campaign_contact_mappings(id) on delete cascade,
  dimension_id uuid not null references campaign_mapping_dimensions(id) on delete cascade,
  level_id uuid not null references campaign_mapping_dimension_levels(id) on delete cascade,
  unique (mapping_id, dimension_id)
);

create index if not exists idx_dimension_scores_mapping on campaign_contact_dimension_scores (mapping_id);

-- מרכזיית טלפנות: תיעוד שיחות משויך לקמפיין + איש קשר
create table if not exists campaign_call_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  called_by uuid references auth.users(id),
  call_date timestamptz not null default now(),
  outcome text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_call_logs_contact on campaign_call_logs (contact_id);
create index if not exists idx_campaign_call_logs_campaign on campaign_call_logs (campaign_id);

-- תזכורות פעולה המשכית, משויכות לקמפיין + איש קשר
create table if not exists campaign_reminders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  due_date date not null,
  note text,
  assigned_to uuid references auth.users(id),
  completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_reminders_due on campaign_reminders (due_date) where not completed;
create index if not exists idx_campaign_reminders_contact on campaign_reminders (contact_id);

-- RLS: אותה מדיניות הרשאות בדיוק כמו קמפיינים/תרומות (admin/treasurer/secretary
-- עורכים, rabbi צופה בלבד, gabai ללא גישה כלל)
alter table campaign_contact_mappings enable row level security;
alter table campaign_mapping_dimensions enable row level security;
alter table campaign_mapping_dimension_levels enable row level security;
alter table campaign_contact_dimension_scores enable row level security;
alter table campaign_call_logs enable row level security;
alter table campaign_reminders enable row level security;

create policy "campaign_mappings_select" on campaign_contact_mappings for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_mappings_insert" on campaign_contact_mappings for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_mappings_update" on campaign_contact_mappings for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_mappings_delete" on campaign_contact_mappings for delete
  to authenticated using (my_role() in ('admin','treasurer'));

create policy "campaign_dimensions_select" on campaign_mapping_dimensions for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_dimensions_insert" on campaign_mapping_dimensions for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimensions_update" on campaign_mapping_dimensions for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimensions_delete" on campaign_mapping_dimensions for delete
  to authenticated using (my_role() in ('admin','treasurer'));

create policy "campaign_dimension_levels_select" on campaign_mapping_dimension_levels for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_dimension_levels_insert" on campaign_mapping_dimension_levels for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimension_levels_update" on campaign_mapping_dimension_levels for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimension_levels_delete" on campaign_mapping_dimension_levels for delete
  to authenticated using (my_role() in ('admin','treasurer'));

create policy "campaign_dimension_scores_select" on campaign_contact_dimension_scores for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_dimension_scores_insert" on campaign_contact_dimension_scores for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimension_scores_update" on campaign_contact_dimension_scores for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_dimension_scores_delete" on campaign_contact_dimension_scores for delete
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

create policy "campaign_call_logs_select" on campaign_call_logs for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_call_logs_insert" on campaign_call_logs for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_call_logs_update" on campaign_call_logs for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_call_logs_delete" on campaign_call_logs for delete
  to authenticated using (my_role() in ('admin','treasurer'));

create policy "campaign_reminders_select" on campaign_reminders for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_reminders_insert" on campaign_reminders for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_reminders_update" on campaign_reminders for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_reminders_delete" on campaign_reminders for delete
  to authenticated using (my_role() in ('admin','treasurer','secretary'));

-- =========================================================
-- 36. טאבים ניתנים לבחירה לכל קמפיין (מיפוי/הזמנה/התרמה, נבחרים בעת יצירת
--    הקמפיין), ומעקב סטטוס הזמנה לקמפיין לכל איש קשר.
--    *** קטע חדש בלבד ***
-- =========================================================
alter table campaigns add column if not exists enabled_tabs text[] not null default array['מיפוי','הזמנה','התרמה'];

create table if not exists campaign_contact_invitations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'לא הוזמן'
    check (status in ('לא הוזמן','הוזמן','אישר הגעה','סירב')),
  invited_at timestamptz,
  invited_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists idx_campaign_invitations_campaign on campaign_contact_invitations (campaign_id);
create index if not exists idx_campaign_invitations_contact on campaign_contact_invitations (contact_id);

drop trigger if exists trg_campaign_invitations_updated on campaign_contact_invitations;
create trigger trg_campaign_invitations_updated before update on campaign_contact_invitations
  for each row execute function set_updated_at();

alter table campaign_contact_invitations enable row level security;

create policy "campaign_invitations_select" on campaign_contact_invitations for select
  to authenticated using (my_role() in ('admin','treasurer','secretary','rabbi'));
create policy "campaign_invitations_insert" on campaign_contact_invitations for insert
  to authenticated with check (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_invitations_update" on campaign_contact_invitations for update
  to authenticated using (my_role() in ('admin','treasurer','secretary'));
create policy "campaign_invitations_delete" on campaign_contact_invitations for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- =========================================================
-- לאחר הרצת הקובץ: צור משתמש ראשון דרך Authentication > Users,
-- ואז עדכן ידנית את תפקידו לאדמין, אשר אותו, וקבע אותו כמנהל ראשי:
--   update profiles set role = 'admin', approved = true, is_super_admin = true where id = '<user-uuid>';
-- =========================================================
