-- =========================================================
-- אינטגרציית API נדרים פלוס - ייבוא היסטורי + סנכרון שוטף
-- =========================================================

-- מזהה עסקה של נדרים פלוס על התרומה עצמה - מפתח דה-דופ יחיד לכל הנתיבים (גם
-- ה-webhook הקיים, גם הייבוא/סנכרון החדש). עד כה זה נשמר רק על
-- nedarim_pending_charges (טבלת staging פנימית של זרימת האייפרם שלנו בלבד),
-- שלא מכסה עסקאות שהגיעו למוסד בדרכים אחרות (ייבוא היסטורי, למשל)
alter table donations add column if not exists nedarim_transaction_id text unique;

-- נשא לאותו מזהה על שורת ה-staging, כדי ש-commitImportRows יוכל להעביר אותו הלאה
-- אל donations.nedarim_transaction_id ברגע שהשורה מאושרת ונהפכת לתרומה בפועל
alter table donation_import_rows add column if not exists nedarim_transaction_id text;

-- backfill חד-פעמי: עסקאות שכבר עברו דרך ה-webhook הקיים מקבלות את המזהה
-- שכבר נשמר עבורן ב-nedarim_pending_charges
update donations d set nedarim_transaction_id = npc.nedarim_transaction_id
from nedarim_pending_charges npc
where npc.result_donation_id = d.id
  and npc.nedarim_transaction_id is not null
  and d.nedarim_transaction_id is null;

-- סמן סנכרון יחיד ומשותף (ייבוא היסטורי ידני + cron שוטף) - singleton, אותו
-- דפוס בדיוק כמו donation_field_settings/contact_field_settings
create table if not exists nedarim_sync_state (
  id boolean primary key default true check (id),
  last_id text,
  updated_at timestamptz not null default now()
);
insert into nedarim_sync_state (id) values (true) on conflict (id) do nothing;

alter table nedarim_sync_state enable row level security;

drop policy if exists "nedarim_sync_state_select" on nedarim_sync_state;
create policy "nedarim_sync_state_select" on nedarim_sync_state for select
  to authenticated using (true);

drop policy if exists "nedarim_sync_state_update" on nedarim_sync_state;
create policy "nedarim_sync_state_update" on nedarim_sync_state for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop trigger if exists trg_nedarim_sync_state_updated on nedarim_sync_state;
create trigger trg_nedarim_sync_state_updated before update on nedarim_sync_state
  for each row execute function set_updated_at();
