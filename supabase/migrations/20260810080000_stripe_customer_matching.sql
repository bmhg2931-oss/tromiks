-- =========================================================
-- שיוך קבוע לפי מזהה לקוח Stripe (בלי צורך בשם/טלפון)
-- =========================================================

-- מזהה הלקוח (Customer) של Stripe על שורת ה-staging - יציב ומזהה את אותו אדם
-- על פני כמה עסקאות, גם כשאין billing_details (שם/טלפון) בעסקה עצמה בכלל
alter table donation_import_rows add column if not exists stripe_customer_id text;

-- כלל שיוך קבוע לפי מזהה לקוח Stripe - אותו דפוס בדיוק כמו
-- donation_phone_mapping_rules, רק שהמפתח הוא stripe_customer_id ולא phone_key.
-- לא מחליף את השיוך לפי טלפון - שני המנגנונים פועלים זה לצד זה (ר'
-- app/(app)/donations/mapping-actions.ts:setRowMatch)
create table if not exists donation_stripe_customer_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text not null unique,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table donation_stripe_customer_mapping_rules enable row level security;

drop policy if exists "donation_stripe_customer_mapping_rules_select" on donation_stripe_customer_mapping_rules;
create policy "donation_stripe_customer_mapping_rules_select" on donation_stripe_customer_mapping_rules for select
  to authenticated using (true);

drop policy if exists "donation_stripe_customer_mapping_rules_insert" on donation_stripe_customer_mapping_rules;
create policy "donation_stripe_customer_mapping_rules_insert" on donation_stripe_customer_mapping_rules for insert
  to authenticated with check (my_role() in ('admin','treasurer'));

drop policy if exists "donation_stripe_customer_mapping_rules_update" on donation_stripe_customer_mapping_rules;
create policy "donation_stripe_customer_mapping_rules_update" on donation_stripe_customer_mapping_rules for update
  to authenticated using (my_role() in ('admin','treasurer'));

drop policy if exists "donation_stripe_customer_mapping_rules_delete" on donation_stripe_customer_mapping_rules;
create policy "donation_stripe_customer_mapping_rules_delete" on donation_stripe_customer_mapping_rules for delete
  to authenticated using (my_role() in ('admin','treasurer'));

drop trigger if exists trg_donation_stripe_customer_mapping_rules_updated on donation_stripe_customer_mapping_rules;
create trigger trg_donation_stripe_customer_mapping_rules_updated
  before update on donation_stripe_customer_mapping_rules
  for each row execute function set_updated_at();
