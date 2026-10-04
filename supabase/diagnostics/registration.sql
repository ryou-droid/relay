-- Read-only checks. Run in Supabase SQL Editor as the trusted administrator.
-- Does NOT display user data, passwords, metadata or API keys.
select to_regclass('public.profiles') as profiles_table,
       to_regprocedure('public.register_profile()') as registration_function;

-- Enabled triggers on both tables, including other triggers that may also fail.
select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name, t.tgenabled as enabled,
       pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and
      ((n.nspname='auth' and c.relname='users') or
       (n.nspname='public' and c.relname='profiles'));

select p.proname, r.rolname as function_owner, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       pg_get_functiondef(p.oid) as function_definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_roles r on r.oid=p.proowner
where n.nspname='public' and p.proname='register_profile' and p.pronargs=0;

select a.attname as column_name, format_type(a.atttypid,a.atttypmod) as data_type,
       a.attnotnull as not_null,
       pg_get_expr(d.adbin,d.adrelid) as default_value
from pg_attribute a
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.profiles') and a.attnum>0 and not a.attisdropped;

select conname as constraint_name, pg_get_constraintdef(oid,true) as definition
from pg_constraint where conrelid=to_regclass('public.profiles');

select c.relrowsecurity as rls_enabled,c.relforcerowsecurity as force_rls,
       table_owner.rolname as table_owner,function_owner.rolname as function_owner,
       function_owner.rolsuper,function_owner.rolbypassrls,
       has_schema_privilege(function_owner.rolname,'public','USAGE') as owner_schema_usage,
       has_table_privilege(function_owner.rolname,c.oid,'INSERT') as owner_can_insert
from pg_class c
join pg_roles table_owner on table_owner.oid=c.relowner
join pg_proc p on p.oid=to_regprocedure('public.register_profile()')
join pg_roles function_owner on function_owner.oid=p.proowner
where c.oid=to_regclass('public.profiles');
