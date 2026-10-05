-- Read-only admin RPCs must not acquire row locks in PostgREST STABLE transactions.
-- Keep require_admin() and all mutation locks unchanged.
begin;

create or replace function public.check_admin_read() returns public.memberships
language plpgsql stable security definer set search_path='' as $$declare me public.memberships; begin
 select * into me from public.memberships m where m.user_id=auth.uid() and m.status='active'
 and m.role in ('department_admin','organization_admin') and public.is_member(m.organization_id,m.department_id);
 if not found then raise exception '管理権限がありません'; end if;
 perform 1 from public.profiles where id=auth.uid() and not suspended;
 if not found then raise exception '管理権限がありません'; end if;
 return me;
end$$;


create or replace function public.admin_approvals() returns table(request_id uuid,user_id uuid,full_name text,email text,planned_department text,"position" text,department_id uuid,email_confirmed boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$begin
 perform public.check_admin_read();
 return query select r.id,p.id,p.full_name,u.email::text,p.planned_department,p.position,r.department_id,(u.email_confirmed_at is not null),r.created_at
 from public.join_requests r join public.profiles p on p.id=r.user_id join auth.users u on u.id=p.id
 where r.status='pending' and not p.suspended and public.admin_scope(r.organization_id,r.department_id)
 order by r.created_at;
end$$;


create or replace function public.admin_users() returns table(membership_id uuid,user_id uuid,full_name text,email text,"position" text,department_id uuid,department_name text,role public.member_role,suspended boolean)
language plpgsql stable security definer set search_path='' as $$begin
 perform public.check_admin_read();
 return query select m.id,p.id,p.full_name,u.email::text,p.position,m.department_id,d.name,m.role,p.suspended
 from public.memberships m join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id join public.departments d on d.id=m.department_id
 where m.status='active' and public.admin_scope(m.organization_id,m.department_id) order by p.full_name;
end$$;


create or replace function public.admin_notices() returns setof public.important_notices
language plpgsql stable security definer set search_path='' as $$begin
 perform public.check_admin_read();
 return query select n.* from public.important_notices n where public.admin_scope(n.organization_id,n.department_id) order by n.created_at desc;
end$$;


revoke execute on function public.check_admin_read() from public,anon,authenticated;
revoke execute on function public.admin_approvals(),public.admin_users(),public.admin_notices() from public,anon;
grant execute on function public.admin_approvals(),public.admin_users(),public.admin_notices() to authenticated;
-- Refresh the PostgREST schema cache after replacing the RPC definitions.
notify pgrst, 'reload schema';
commit;
