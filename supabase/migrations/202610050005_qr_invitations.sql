-- Two QR kinds only. Existing invitations/requests remain ordinary user invitations.
begin;
alter table public.organization_invitations add column invite_type text not null default 'user' check(invite_type in ('user','admin'));
alter table public.join_requests add column invite_type text not null default 'user' check(invite_type in ('user','admin'));

create function public.create_qr_invitation(p_type text) returns uuid
language plpgsql security definer set search_path='' as $$declare me public.memberships; result uuid; begin
 me:=public.require_admin();
 if me.role<>'organization_admin' or p_type is null or p_type not in ('user','admin') then raise exception '招待を作成できません'; end if;
 -- Reuse one valid organization-wide invitation per kind. No department-specific QR.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(me.organization_id::text||p_type,0));
 select id into result from public.organization_invitations where organization_id=me.organization_id and department_id is null and invite_type=p_type and active and expires_at>now() order by created_at desc limit 1;
 if found then return result; end if;
 insert into public.organization_invitations(organization_id,created_by,invite_type) values(me.organization_id,auth.uid(),p_type) returning id into result;
 insert into public.admin_activity_logs(organization_id,actor_id,action,target_id,after_data) values(me.organization_id,auth.uid(),'invitation_created',result,jsonb_build_object('invite_type',p_type));
 return result;
end$$;

create function public.qr_invitations() returns table(id uuid,invite_type text,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$declare me public.memberships; begin
 me:=public.check_admin_read();
 if me.role<>'organization_admin' then raise exception '招待を表示できません'; end if;
 return query select distinct on (i.invite_type) i.id,i.invite_type,i.expires_at from public.organization_invitations i
 where i.organization_id=me.organization_id and i.department_id is null and i.active and i.expires_at>now() order by i.invite_type,i.created_at desc;
end$$;

-- Public lookup exposes only the kind, never organization/member information.
create function public.invitation_kind(p_invitation uuid) returns text
language sql stable security definer set search_path='' as $$
 select invite_type from public.organization_invitations i where i.id=p_invitation and i.active and i.expires_at>now() and (i.department_id is null or exists(select 1 from public.departments d where d.id=i.department_id and d.active))
$$;

create or replace function public.enqueue_join_request(p_user uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$declare i public.organization_invitations; begin
 perform 1 from public.profiles where id=p_user and not suspended for update;
 if not found then raise exception '参加申請できません'; end if;
 if exists(select 1 from public.memberships where user_id=p_user and status='active') then raise exception 'すでに所属しています'; end if;
 select * into i from public.organization_invitations where id=p_invitation and active and expires_at>now() for share;
 if not found or (i.department_id is not null and not exists(select 1 from public.departments where id=i.department_id and active)) then raise exception '招待コードが無効または期限切れです'; end if;
 if exists(select 1 from public.join_requests where user_id=p_user and status='pending') then raise exception 'すでに参加申請済みです'; end if;
 -- Never take the kind/role from URL, form fields or Auth metadata.
 insert into public.join_requests(user_id,organization_id,department_id,invitation_id,invite_type) values(p_user,i.organization_id,i.department_id,i.id,i.invite_type);
end$$;

create function public.admin_approval_candidates() returns table(request_id uuid,user_id uuid,full_name text,email text,planned_department text,"position" text,department_id uuid,email_confirmed boolean,created_at timestamptz,invite_type text)
language plpgsql stable security definer set search_path='' as $$declare me public.memberships; begin
 me:=public.check_admin_read();
 return query select r.id,p.id,p.full_name,u.email::text,p.planned_department,p.position,r.department_id,(u.email_confirmed_at is not null),r.created_at,r.invite_type
 from public.join_requests r join public.profiles p on p.id=r.user_id join auth.users u on u.id=p.id
 where r.status='pending' and not p.suspended and public.admin_scope(r.organization_id,r.department_id)
 and (r.invite_type='user' or me.role='organization_admin') order by r.created_at;
end$$;

create or replace function public.approve_user(p_request uuid,p_department uuid) returns void
language plpgsql security definer set search_path='' as $$declare me public.memberships; r public.join_requests; i public.organization_invitations; assigned_role public.member_role; begin
 me:=public.require_admin();
 select * into r from public.join_requests where id=p_request for update;
 if not found or r.status<>'pending' or not public.admin_scope(r.organization_id,r.department_id) or not public.admin_scope(r.organization_id,p_department) then raise exception '承認できません'; end if;
 select * into i from public.organization_invitations where id=r.invitation_id for share;
 if not found or i.invite_type<>r.invite_type or (r.invite_type='admin' and me.role<>'organization_admin') then raise exception '承認できません'; end if;
 assigned_role:=case when r.invite_type='admin' then 'organization_admin'::public.member_role else 'user'::public.member_role end;
 perform 1 from public.profiles where id=r.user_id and not suspended for update;
 if not found or not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'メール確認済みのユーザーのみ承認できます'; end if;
 perform 1 from public.departments where id=p_department and organization_id=r.organization_id and active for share;
 if not found then raise exception '有効な部署を選択してください'; end if;
 if exists(select 1 from public.memberships where user_id=r.user_id and status='active') then raise exception 'すでに所属しています'; end if;
 insert into public.memberships(user_id,organization_id,department_id,role,status) values(r.user_id,r.organization_id,p_department,assigned_role,'active')
 on conflict(user_id,department_id) do update set role=assigned_role,status='active';
 update public.join_requests set status='approved',approved_by=auth.uid(),decided_at=now() where id=p_request;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id,after_data)
 values(r.organization_id,p_department,auth.uid(),'user_approved',r.user_id,jsonb_build_object('request_id',p_request,'role',assigned_role));
end$$;

create or replace function public.admin_approvals() returns table(request_id uuid,user_id uuid,full_name text,email text,planned_department text,"position" text,department_id uuid,email_confirmed boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$begin
 perform public.check_admin_read();
 return query select r.id,p.id,p.full_name,u.email::text,p.planned_department,p.position,r.department_id,(u.email_confirmed_at is not null),r.created_at
 from public.join_requests r join public.profiles p on p.id=r.user_id join auth.users u on u.id=p.id
 where r.status='pending' and not p.suspended and public.admin_scope(r.organization_id,r.department_id)
 and (r.invite_type='user' or public.admin_scope(r.organization_id,null)) order by r.created_at;
end$$;
create or replace function public.admin_dashboard() returns table(pending_count bigint)
language plpgsql stable security definer set search_path='' as $$declare me public.memberships; begin
 me:=public.check_admin_read();
 return query select count(*) from public.join_requests r join public.profiles p on p.id=r.user_id
 where r.status='pending' and not p.suspended and r.organization_id=me.organization_id
 and (me.role='organization_admin' or (r.department_id=me.department_id and r.invite_type='user'));
end$$;
create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare me public.memberships; i public.organization_invitations; begin
 me:=public.require_admin();
 select * into i from public.organization_invitations where id=p_id for update;
 if not found or not public.admin_scope(i.organization_id,i.department_id) or (i.invite_type='admin' and me.role<>'organization_admin') then raise exception '管理権限がありません'; end if;
 update public.organization_invitations set active=false where id=p_id;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id) values(i.organization_id,i.department_id,auth.uid(),'invitation_revoked',p_id);
end$$;

-- Tighten visibility even if a request/invitation has a department assigned by an operator.
drop policy invitations_admin_read on public.organization_invitations;
create policy invitations_admin_read on public.organization_invitations for select to authenticated using(public.admin_scope(organization_id,department_id) and (invite_type='user' or public.admin_scope(organization_id,null)));
drop policy requests_read on public.join_requests;
create policy requests_read on public.join_requests for select to authenticated using(user_id=auth.uid() or (public.admin_scope(organization_id,department_id) and (invite_type='user' or public.admin_scope(organization_id,null))));
revoke execute on function public.qr_invitations(),public.create_qr_invitation(text),public.invitation_kind(uuid),public.admin_approval_candidates() from public,anon,authenticated;
grant execute on function public.invitation_kind(uuid) to anon,authenticated;
grant execute on function public.qr_invitations(),public.create_qr_invitation(text),public.admin_approval_candidates() to authenticated;
-- Existing internal helper EXECUTE revocation and approval grants remain unchanged.
notify pgrst, 'reload schema';
commit;
