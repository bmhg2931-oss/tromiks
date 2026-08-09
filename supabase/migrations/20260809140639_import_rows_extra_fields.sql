-- =========================================================
-- שדות נוספים לשורת ייבוא תרומה - קטגוריה/קמפיין, מוקד תשלום, סוג התחייבות,
-- מטפל, סטטוס, ופרטי שיק/העברה - כדי שהמיפוי יכסה את מלוא מודל הנתונים
-- הקיים של donations/pledges, לא רק תת-קבוצה בסיסית
-- =========================================================

alter table donation_import_rows add column if not exists category text;
alter table donation_import_rows add column if not exists payment_hub text
  check (payment_hub is null or payment_hub in ('ישראל','ארה"ב','אנגליה','שווייץ','בלגיה'));
alter table donation_import_rows add column if not exists pledge_type text
  check (pledge_type is null or pledge_type in ('תרומה חד"פ','הוראת קבע'));
alter table donation_import_rows add column if not exists handler text;
alter table donation_import_rows add column if not exists status text
  check (status is null or status in ('שולם','ממתין','נכשל','בוטל','מוחזר'));
alter table donation_import_rows add column if not exists bank_name text;
alter table donation_import_rows add column if not exists branch_number text;
alter table donation_import_rows add column if not exists account_number text;
alter table donation_import_rows add column if not exists check_number text;
alter table donation_import_rows add column if not exists check_date date;
