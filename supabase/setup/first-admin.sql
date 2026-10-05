-- Trusted Supabase SQL Editor only. Never execute this from the application.
-- Set the email AND organization UUID, review them, then execute once.
-- The user must already have an active membership (test-membership.sql can create it).
begin;
do $$
declare
  admin_email text := 'your-admin-email@example.com';
  target_organization uuid := '10000000-0000-4000-8000-000000000001';
  target_membership uuid;
begin
  select m.id into target_membership from public.memberships m
  join auth.users u on u.id=m.user_id
  join public.departments d on d.id=m.department_id
  join public.profiles p on p.id=m.user_id
  where lower(u.email)=lower(admin_email) and u.email_confirmed_at is not null
    and m.organization_id=target_organization and m.status='active'
    and d.active and not p.suspended;
  if target_membership is null then
    raise exception '対象組織に所属するメール確認済みのユーザーが見つかりません';
  end if;
  update public.memberships set role='organization_admin' where id=target_membership;
end $$;
commit;
