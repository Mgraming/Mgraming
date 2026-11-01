-- Run after schema.sql. Every row should say ✅. Anything with ❌ means a step didn't finish.
select item, case when ok then '✅' else '❌' end as status from (
  select 'الجداول (١٧)' as item,
    (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') = 17 as ok
  union all
  select 'الحماية (RLS) شغالة على كل الجداول',
    not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity)
  union all
  select 'إنشاء حساب تلقائي لكل مستخدم جديد',
    exists (select 1 from pg_trigger where tgname = 'on_auth_user_created')
  union all
  select 'البنزين والورق (تحديث ٠٠٢)',
    exists (select 1 from information_schema.tables where table_name = 'fuel_logs')
    and exists (select 1 from information_schema.tables where table_name = 'car_documents')
  union all
  select 'مصدر التسجيل (تحديث ٠٠٣)',
    exists (select 1 from information_schema.columns where table_name = 'workshops' and column_name = 'source')
  union all
  select 'الضمان بيبدأ لوحده',
    exists (select 1 from pg_trigger where tgname = 'jobs_start_warranty')
  union all
  select 'الشات اللحظي (Realtime)',
    exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages')
  union all
  select 'مكان صور الفواتير (Storage)',
    exists (select 1 from storage.buckets where id = 'invoices')
) checks;
