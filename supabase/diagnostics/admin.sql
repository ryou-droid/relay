-- Read-only catalog diagnostics. No user records, emails, JWTs or keys are returned.
-- Run as the trusted administrator in SQL Editor.
-- auth.uid() in SQL Editor is normally NULL: it is NOT the browser's JWT context.
select auth.uid() is null as sql_editor_without_browser_jwt;
select p.proname, p.provolatile, p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner) as function_owner,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('admin_approvals','admin_users','admin_notices','require_admin','check_admin_read','admin_scope','is_member')
order by p.proname;
-- Read RPCs remain STABLE, while their read-only helper has no FOR SHARE.
-- require_admin retains mutation locks and has no authenticated/anon EXECUTE grant.
select c.relname, c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
       has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('memberships','departments','profiles','join_requests','organization_invitations','important_notices');
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
 ('memberships','departments','profiles','join_requests','organization_invitations','important_notices')
order by tablename,policyname;
