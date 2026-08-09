-- =========================================================
-- מסך "מיפוי תרומות" - ייבוא תרומות מקובץ ושיוך לאנשי קשר
-- =========================================================

-- קובץ ייבוא אחד (העלאה בודדת)
create table if not exists donation_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('כללי','נדרים פלוס','פורטל SOLA')),
  filename text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table donation_import_batches enable row level security;

drop policy if exists "donation_import_batches_select" on donation_import_batches;
create policy "donation_import_batches_select" on donation_import_batches for select
  to authenticated using (true);

drop policy if exists "donation_import_batches_insert" on donation_import_batches;
create policy "donation_import_batches_insert" on donation_import_batches for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_import_batches_update" on donation_import_batches;
create policy "donation_import_batches_update" on donation_import_batches for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop policy if exists "donation_import_batches_delete" on donation_import_batches;
create policy "donation_import_batches_delete" on donation_import_batches for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- שורה בודדת מתוך קובץ - staging, "מקודמת" ל-donations/pledges רק אחרי שיוך+אישור
-- (donations.contact_id הוא NOT NULL, כך ששורה לא-משויכת לא יכולה להיכתב לשם בכלל)
create table if not exists donation_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references donation_import_batches(id) on delete cascade,
  raw jsonb not null,                        -- השורה הגולמית כפי שנקראה, לדיבוג/שחזור
  donor_name text,
  phone text,
  phone_key text,                            -- 6 ספרות אחרונות מנורמלות (חיפוש/שיוך)
  amount numeric(12,2),
  currency text not null default '₪',
  donation_date date,
  payment_method_raw text,                   -- הטקסט המקורי מהקובץ
  payment_method text,                       -- הניחוש/הבחירה המתוקננת (אחרי אישור משתמש)
  record_type text not null default 'payment_only'
    check (record_type in ('pledge','pledge_and_payment','payment_only')),
  notes text,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched','ambiguous','matched','imported','skipped')),
  matched_contact_id uuid references contacts(id),
  match_source text check (match_source in ('auto_suffix','permanent_rule','manual','one_time_override')),
  possible_duplicate boolean not null default false,
  created_donation_id uuid references donations(id),
  created_pledge_id uuid references pledges(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table donation_import_rows enable row level security;

drop policy if exists "donation_import_rows_select" on donation_import_rows;
create policy "donation_import_rows_select" on donation_import_rows for select
  to authenticated using (true);

drop policy if exists "donation_import_rows_insert" on donation_import_rows;
create policy "donation_import_rows_insert" on donation_import_rows for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_import_rows_update" on donation_import_rows;
create policy "donation_import_rows_update" on donation_import_rows for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop policy if exists "donation_import_rows_delete" on donation_import_rows;
create policy "donation_import_rows_delete" on donation_import_rows for delete
  to authenticated using (my_role() in ('admin','treasurer'));

-- אכיפה ברמת המקור: record_type='pledge' מותר רק במקור 'כללי', כי נדרים פלוס/SOLA
-- משקפים תמיד כסף שהתקבל בפועל - אין שם תרחיש של "הבטחה בלי תשלום". בדיקה תלויה
-- בעמודת source של donation_import_batches (טבלה אחרת), ולכן טריגר ולא CHECK פשוט -
-- באותה שיטה כמו enforce_campaign_single_level() הקיים לקמפיינים
create or replace function enforce_import_row_record_type() returns trigger as $$
declare
  batch_source text;
begin
  select source into batch_source from donation_import_batches where id = new.batch_id;
  if new.record_type = 'pledge' and batch_source <> 'כללי' then
    raise exception 'record_type=pledge מותר רק בייבוא ממקור כללי (מקור נוכחי: %)', batch_source;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_import_rows_record_type on donation_import_rows;
create trigger trg_import_rows_record_type
  before insert or update on donation_import_rows
  for each row execute function enforce_import_row_record_type();

-- כלל שיוך קבוע וגלובלי: טלפון (6 ספרות אחרונות) -> איש קשר, חוצה את כל מקורות הייבוא
create table if not exists donation_phone_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  phone_key text not null unique,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table donation_phone_mapping_rules enable row level security;

drop policy if exists "donation_phone_mapping_rules_select" on donation_phone_mapping_rules;
create policy "donation_phone_mapping_rules_select" on donation_phone_mapping_rules for select
  to authenticated using (true);

drop policy if exists "donation_phone_mapping_rules_insert" on donation_phone_mapping_rules;
create policy "donation_phone_mapping_rules_insert" on donation_phone_mapping_rules for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_phone_mapping_rules_update" on donation_phone_mapping_rules;
create policy "donation_phone_mapping_rules_update" on donation_phone_mapping_rules for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop policy if exists "donation_phone_mapping_rules_delete" on donation_phone_mapping_rules;
create policy "donation_phone_mapping_rules_delete" on donation_phone_mapping_rules for delete
  to authenticated using (my_role() in ('admin','treasurer'));

drop trigger if exists trg_donation_phone_mapping_rules_updated on donation_phone_mapping_rules;
create trigger trg_donation_phone_mapping_rules_updated
  before update on donation_phone_mapping_rules
  for each row execute function set_updated_at();

-- מוסיף ערך 'ייבוא קובץ' לרשימת המקורות המותרים לתרומה (donations.source)
alter table donations drop constraint if exists donations_source_check;
alter table donations add constraint donations_source_check
  check (source in ('הזנה ידנית','טופס אתר','הוראת קבע אוטומטית','ייבוא קובץ'));
