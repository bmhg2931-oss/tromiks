-- =========================================================
-- אינטגרציית Stripe - קבלת תרומות חדשות (Checkout) + ייבוא/סנכרון היסטוריה
-- =========================================================

-- מזהה payment_intent של Stripe על התרומה עצמה - מפתח דה-דופ יחיד לכל הנתיבים
-- (גם ה-webhook, גם הייבוא/סנכרון ההיסטורי), באותו דפוס בדיוק כמו
-- donations.nedarim_transaction_id
alter table donations add column if not exists stripe_payment_intent_id text unique;

-- נשא לאותו מזהה על שורת ה-staging, כדי ש-commitImportRows יוכל להעביר אותו
-- הלאה אל donations.stripe_payment_intent_id ברגע שהשורה מאושרת
alter table donation_import_rows add column if not exists stripe_payment_intent_id text;

-- מוסיף ערך 'Stripe' לרשימת המקורות המותרים לייבוא (donation_import_batches.source)
alter table donation_import_batches drop constraint if exists donation_import_batches_source_check;
alter table donation_import_batches add constraint donation_import_batches_source_check
  check (source in ('כללי','נדרים פלוס','פורטל SOLA','Stripe'));

-- סמן סנכרון יחיד ומשותף (ייבוא היסטורי ידני + cron גיבוי) - singleton, אותו
-- דפוס בדיוק כמו nedarim_sync_state
create table if not exists stripe_sync_state (
  id boolean primary key default true check (id),
  last_payment_intent_id text,
  updated_at timestamptz not null default now()
);
insert into stripe_sync_state (id) values (true) on conflict (id) do nothing;

alter table stripe_sync_state enable row level security;

drop policy if exists "stripe_sync_state_select" on stripe_sync_state;
create policy "stripe_sync_state_select" on stripe_sync_state for select
  to authenticated using (true);

drop policy if exists "stripe_sync_state_update" on stripe_sync_state;
create policy "stripe_sync_state_update" on stripe_sync_state for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop trigger if exists trg_stripe_sync_state_updated on stripe_sync_state;
create trigger trg_stripe_sync_state_updated before update on stripe_sync_state
  for each row execute function set_updated_at();
