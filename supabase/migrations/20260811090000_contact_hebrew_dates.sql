-- =========================================================
-- תאריכון - תאריכים עבריים חוזרים לאיש קשר (יארצייט/יום הולדת/אחר)
-- =========================================================

create table if not exists contact_hebrew_dates (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  hebrew_day smallint not null check (hebrew_day between 1 and 30),
  hebrew_month text not null,  -- מפתח חודש עברי (Nisan/Iyyar/.../"Adar I"/"Adar II") - ר' HEBREW_MONTH_NAMES ב-lib/hebrewDate.ts
  hebrew_year integer,         -- אופציונלי (למשל שנת לידה/פטירה) - התאריך עצמו חוזר כל שנה בלי תלות בזה
  date_type text not null check (date_type in ('יארצייט','יום הולדת','אחר')),
  details text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_hebrew_dates_contact on contact_hebrew_dates(contact_id);

alter table contact_hebrew_dates enable row level security;

-- אותה מדיניות פתוחה בדיוק כמו contact_tasks - אכיפת הרשאה נעשית ברמת האפליקציה
-- (פרופ editable שכבר מגיע מ-canEditContacts בכל שאר מסך אנשי הקשר)
drop policy if exists "contact_hebrew_dates_select" on contact_hebrew_dates;
create policy "contact_hebrew_dates_select" on contact_hebrew_dates for select
  to authenticated using (true);

drop policy if exists "contact_hebrew_dates_insert" on contact_hebrew_dates;
create policy "contact_hebrew_dates_insert" on contact_hebrew_dates for insert
  to authenticated with check (true);

drop policy if exists "contact_hebrew_dates_delete" on contact_hebrew_dates;
create policy "contact_hebrew_dates_delete" on contact_hebrew_dates for delete
  to authenticated using (true);

drop trigger if exists trg_contact_hebrew_dates_updated on contact_hebrew_dates;
create trigger trg_contact_hebrew_dates_updated before update on contact_hebrew_dates
  for each row execute function set_updated_at();
