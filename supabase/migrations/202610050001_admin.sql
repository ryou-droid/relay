-- Apply after 202610040002. No service-role access is needed by the application.
begin;
alter table public.departments add column active boolean not null default true;
alter table public.profiles add column suspended boolean not null default false;
-- Existing duplicate names must be resolved by the operator before applying this migration.
create unique index departments_org_name_unique on public.departments(organization_id,lower(btrim(name)));
alter table public.departments add constraint department_name_trimmed check(name=btrim(name));

create table public.organization_invitations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 department_id uuid,
 created_by uuid not null references public.profiles,
 active boolean not null default true,
 expires_at timestamptz not null default now()+interval '30 days',
 created_at timestamptz not null default now(),
 foreign key(department_id,organization_id) references public.departments(id,organization_id)
);
create table public.join_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles,
 organization_id uuid not null references public.organizations,
 department_id uuid,
 invitation_id uuid not null references public.organization_invitations,
 status text not null default 'pending' check(status in ('pending','approved','cancelled')),
 approved_by uuid references public.profiles,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 foreign key(department_id,organization_id) references public.departments(id,organization_id)
);
create unique index one_pending_request on public.join_requests(user_id) where status='pending';
create index pending_requests_org on public.join_requests(organization_id,department_id) where status='pending';
create table public.admin_activity_logs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 department_id uuid,
 actor_id uuid not null references public.profiles,
 action text not null,
 target_id uuid not null,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.is_member(org uuid,dept uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m
 join public.profiles p on p.id=m.user_id
 join public.departments d on d.id=m.department_id and d.organization_id=m.organization_id
 where m.user_id=auth.uid() and m.status='active' and not p.suspended and d.active
 and m.organization_id=org and (dept is null or m.department_id=dept))
$$;
create function public.admin_scope(org uuid,dept uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m where m.user_id=auth.uid()
 and m.status='active' and m.organization_id=org and public.is_member(m.organization_id,m.department_id)
 and (m.role='organization_admin' or (m.role='department_admin' and dept=m.department_id)))
$$;
-- Internal helper: deliberately not executable by API roles.
create function public.require_admin() returns public.memberships
language plpgsql security definer set search_path='' as $$declare me public.memberships; begin
 select * into me from public.memberships m where m.user_id=auth.uid() and m.status='active'
 and m.role in ('department_admin','organization_admin') and public.is_member(m.organization_id,m.department_id) for share;
 if not found then raise exception '管理権限がありません'; end if;
 perform 1 from public.profiles where id=auth.uid() and not suspended for share;
 if not found then raise exception '管理権限がありません'; end if;
 return me;
end$$;

alter table public.organization_invitations enable row level security;
alter table public.join_requests enable row level security;
alter table public.admin_activity_logs enable row level security;
revoke all on public.organization_invitations,public.join_requests,public.admin_activity_logs from public,anon,authenticated;
grant select on public.organization_invitations,public.join_requests,public.admin_activity_logs to authenticated;
create policy invitations_admin_read on public.organization_invitations for select to authenticated using(public.admin_scope(organization_id,department_id));
create policy requests_read on public.join_requests for select to authenticated using(user_id=auth.uid() or public.admin_scope(organization_id,department_id));
create policy admin_audit_read on public.admin_activity_logs for select to authenticated using(public.admin_scope(organization_id,department_id));
create policy departments_admin_read on public.departments for select to authenticated using(public.admin_scope(organization_id,id));
create policy memberships_admin_read on public.memberships for select to authenticated using(public.admin_scope(organization_id,department_id));
-- Never broaden profiles SELECT to reveal colleagues' private signup fields to regular users.

create function public.create_invitation(p_department uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$declare me public.memberships; result uuid; begin
 me:=public.require_admin();
 if not public.admin_scope(me.organization_id,p_department) then raise exception '管理権限がありません'; end if;
 if p_department is not null and not exists(select 1 from public.departments where id=p_department and organization_id=me.organization_id and active) then raise exception '有効な部署を選択してください'; end if;
 insert into public.organization_invitations(organization_id,department_id,created_by) values(me.organization_id,p_department,auth.uid()) returning id into result;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id) values(me.organization_id,p_department,auth.uid(),'invitation_created',result);
 return result;
end$$;
create function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare i public.organization_invitations; begin
 perform public.require_admin();
 select * into i from public.organization_invitations where id=p_id for update;
 if not found or not public.admin_scope(i.organization_id,i.department_id) then raise exception '管理権限がありません'; end if;
 update public.organization_invitations set active=false where id=p_id;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id) values(i.organization_id,i.department_id,auth.uid(),'invitation_revoked',p_id);
end$$;
-- Internal admission helper used by both the Auth trigger and authenticated request RPC.
create function public.enqueue_join_request(p_user uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$declare i public.organization_invitations; begin
 perform 1 from public.profiles where id=p_user and not suspended for update;
 if not found then raise exception '参加申請できません'; end if;
 if exists(select 1 from public.memberships where user_id=p_user and status='active') then raise exception 'すでに所属しています'; end if;
 select * into i from public.organization_invitations where id=p_invitation and active and expires_at>now() for share;
 if not found or (i.department_id is not null and not exists(select 1 from public.departments where id=i.department_id and active)) then raise exception '招待コードが無効または期限切れです'; end if;
 if exists(select 1 from public.join_requests where user_id=p_user and status='pending') then raise exception 'すでに参加申請済みです'; end if;
 insert into public.join_requests(user_id,organization_id,department_id,invitation_id) values(p_user,i.organization_id,i.department_id,i.id);
end$$;
create function public.request_membership(p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'ログインしてください'; end if;
 perform public.enqueue_join_request(auth.uid(),p_invitation);
end$$;
create function public.register_join_request() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if nullif(btrim(new.raw_user_meta_data->>'invitation_code'),'') is not null then
  perform public.enqueue_join_request(new.id,(new.raw_user_meta_data->>'invitation_code')::uuid);
 end if;
 return new;
end$$;
-- PostgreSQL runs same-event triggers alphabetically: profiles are created first.
create trigger z_register_join_request after insert on auth.users for each row execute function public.register_join_request();

create function public.admin_approvals() returns table(request_id uuid,user_id uuid,full_name text,email text,planned_department text,"position" text,department_id uuid,email_confirmed boolean,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$begin
 perform public.require_admin();
 return query select r.id,p.id,p.full_name,u.email::text,p.planned_department,p.position,r.department_id,(u.email_confirmed_at is not null),r.created_at
 from public.join_requests r join public.profiles p on p.id=r.user_id join auth.users u on u.id=p.id
 where r.status='pending' and not p.suspended and public.admin_scope(r.organization_id,r.department_id)
 order by r.created_at;
end$$;
create function public.approve_user(p_request uuid,p_department uuid) returns void
language plpgsql security definer set search_path='' as $$declare r public.join_requests; begin
 perform public.require_admin();
 select * into r from public.join_requests where id=p_request for update;
 if not found or r.status<>'pending' or not public.admin_scope(r.organization_id,r.department_id) or not public.admin_scope(r.organization_id,p_department) then raise exception '承認できません'; end if;
 perform 1 from public.profiles where id=r.user_id and not suspended for update;
 if not found or not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'メール確認済みのユーザーのみ承認できます'; end if;
 perform 1 from public.departments where id=p_department and organization_id=r.organization_id and active for share;
 if not found then raise exception '有効な部署を選択してください'; end if;
 if exists(select 1 from public.memberships where user_id=r.user_id and status='active') then raise exception 'すでに所属しています'; end if;
 insert into public.memberships(user_id,organization_id,department_id,role,status) values(r.user_id,r.organization_id,p_department,'user','active')
 on conflict(user_id,department_id) do update set role='user',status='active';
 update public.join_requests set status='approved',approved_by=auth.uid(),decided_at=now() where id=p_request;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id,after_data)
 values(r.organization_id,p_department,auth.uid(),'user_approved',r.user_id,jsonb_build_object('request_id',p_request,'role','user'));
end$$;
create function public.admin_users() returns table(membership_id uuid,user_id uuid,full_name text,email text,"position" text,department_id uuid,department_name text,role public.member_role,suspended boolean)
language plpgsql stable security definer set search_path='' as $$begin
 perform public.require_admin();
 return query select m.id,p.id,p.full_name,u.email::text,p.position,m.department_id,d.name,m.role,p.suspended
 from public.memberships m join public.profiles p on p.id=m.user_id join auth.users u on u.id=p.id join public.departments d on d.id=m.department_id
 where m.status='active' and public.admin_scope(m.organization_id,m.department_id) order by p.full_name;
end$$;
create function public.manage_user(p_membership uuid,p_role public.member_role,p_suspended boolean,p_department uuid) returns void
language plpgsql security definer set search_path='' as $$declare me public.memberships; target public.memberships; previous_suspended boolean; begin
 me:=public.require_admin();
 -- Serialize organization-wide role/status changes to preserve the last-admin rule.
 perform 1 from public.organizations where id=me.organization_id for update;
 select * into target from public.memberships where id=p_membership and status='active' for update;
 if not found or target.user_id=auth.uid() or not public.admin_scope(target.organization_id,target.department_id) then raise exception '変更できません'; end if;
 if p_role is null or p_suspended is null or p_department is null then raise exception '入力内容を確認してください'; end if;
 if me.role='department_admin' and (target.role<>'user' or p_role<>'user' or p_department<>me.department_id) then raise exception '部署管理者は自部署の一般ユーザーのみ管理できます'; end if;
 if not public.admin_scope(target.organization_id,p_department) or not exists(select 1 from public.departments where id=p_department and organization_id=target.organization_id and active) then raise exception '有効な部署を選択してください'; end if;
 select suspended into previous_suspended from public.profiles where id=target.user_id for update;
 if target.role='organization_admin' and (p_role<>'organization_admin' or p_suspended) and not exists(
  select 1 from public.memberships m where m.organization_id=target.organization_id and m.user_id<>target.user_id and m.status='active' and m.role='organization_admin' and public.is_member(m.organization_id,m.department_id)
 ) then raise exception '最後の組織管理者は停止・降格できません'; end if;
 if p_department<>target.department_id and exists(select 1 from public.memberships where user_id=target.user_id and department_id=p_department and id<>target.id) then
  -- Preserve old membership history; activate the existing destination row.
  update public.memberships set status='revoked' where id=target.id;
  update public.memberships set status='active',role=p_role where user_id=target.user_id and department_id=p_department;
 else update public.memberships set role=p_role,department_id=p_department where id=target.id; end if;
 update public.profiles set suspended=p_suspended where id=target.user_id;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id,before_data,after_data)
 values(target.organization_id,target.department_id,auth.uid(),'user_updated',target.user_id,
 jsonb_build_object('role',target.role,'suspended',previous_suspended,'department_id',target.department_id),
 jsonb_build_object('role',p_role,'suspended',p_suspended,'department_id',p_department));
end$$;
create function public.save_department(p_id uuid,p_name text,p_active boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$declare me public.memberships; result uuid; begin
 me:=public.require_admin();
 if me.role<>'organization_admin' then raise exception '組織管理者のみ部署を変更できます'; end if;
 perform 1 from public.organizations where id=me.organization_id for update;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_active is null then raise exception '部署名を確認してください'; end if;
 if p_id is null then
  insert into public.departments(organization_id,name,active) values(me.organization_id,btrim(p_name),p_active) returning id into result;
 else
  perform 1 from public.departments where id=p_id and organization_id=me.organization_id for update;
  if not found then raise exception '管理権限がありません'; end if;
  if not p_active and exists(select 1 from public.memberships where department_id=p_id and status='active') then raise exception '所属ユーザーのいる部署は無効化できません'; end if;
  update public.departments set name=btrim(p_name),active=p_active where id=p_id; result:=p_id;
 end if;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id,after_data)
 values(me.organization_id,result,auth.uid(),'department_saved',result,jsonb_build_object('name',btrim(p_name),'active',p_active));
 return result;
end$$;
create function public.admin_notices() returns setof public.important_notices
language plpgsql stable security definer set search_path='' as $$begin
 perform public.require_admin();
 return query select n.* from public.important_notices n where public.admin_scope(n.organization_id,n.department_id) order by n.created_at desc;
end$$;
create function public.save_notice(p_department uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$declare me public.memberships; result uuid; begin
 me:=public.require_admin();
 perform 1 from public.organizations where id=me.organization_id for update;
 if not public.admin_scope(me.organization_id,p_department) then raise exception '管理権限がありません'; end if;
 if p_department is not null and not exists(select 1 from public.departments where id=p_department and organization_id=me.organization_id and active) then raise exception '有効な部署を選択してください'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then raise exception 'お知らせは1〜500文字で入力してください'; end if;
 update public.important_notices set active=false where organization_id=me.organization_id and department_id is not distinct from p_department and active;
 insert into public.important_notices(organization_id,department_id,author_id,body) values(me.organization_id,p_department,auth.uid(),btrim(p_body)) returning id into result;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id) values(me.organization_id,p_department,auth.uid(),'notice_published',result);
 return result;
end$$;
create function public.disable_notice(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare n public.important_notices; begin
 perform public.require_admin();
 select * into n from public.important_notices where id=p_id for update;
 if not found or not public.admin_scope(n.organization_id,n.department_id) then raise exception '管理権限がありません'; end if;
 update public.important_notices set active=false where id=p_id;
 insert into public.admin_activity_logs(organization_id,department_id,actor_id,action,target_id) values(n.organization_id,n.department_id,auth.uid(),'notice_disabled',p_id);
end$$;

-- Stop/inactive-department gates also apply to existing user RPCs.
create or replace function public.department_members() returns table(user_id uuid,display_name text) language sql stable security definer set search_path='' as $$select p.id,p.full_name from public.profiles p join public.memberships m on m.user_id=p.id where m.status='active' and not p.suspended and public.is_member(m.organization_id,m.department_id) and exists(select 1 from public.memberships me where me.user_id=auth.uid() and me.status='active' and public.is_member(me.organization_id,me.department_id) and me.organization_id=m.organization_id and me.department_id=m.department_id) order by p.full_name$$;
create or replace function public.save_post(p_id uuid,p_title text,p_body text,p_kind text,p_priority text,p_due_at timestamptz,p_assignees uuid[]) returns uuid language plpgsql security definer set search_path='' as $$declare m public.memberships; p public.posts; result uuid; begin
select * into m from public.memberships where user_id=auth.uid() and status='active'; if not found or not public.is_member(m.organization_id,m.department_id) then raise exception '組織への参加が必要です'; end if;
if p_id is not null then select * into p from public.posts where id=p_id for update; if not found or not public.can_read_post(p_id) or p.author_id<>auth.uid() or p.accepted_at is not null then raise exception '編集できません'; end if; end if;
if exists(select 1 from unnest(p_assignees) a where not exists(select 1 from public.memberships x where x.user_id=a and x.department_id=m.department_id and x.organization_id=m.organization_id and x.status='active' and exists(select 1 from public.profiles pr where pr.id=x.user_id and not pr.suspended))) then raise exception '担当者は同じ部署から選択してください'; end if;
if p_id is null then insert into public.posts(organization_id,department_id,author_id,title,body,kind,priority,due_at) values(m.organization_id,m.department_id,auth.uid(),p_title,p_body,p_kind,p_priority,p_due_at) returning id into result;
else result:=p_id; update public.posts set title=p_title,body=p_body,kind=p_kind,priority=p_priority,due_at=p_due_at where id=p_id; delete from public.post_assignees where post_id=p_id; end if;
insert into public.post_assignees select result,a from (select distinct unnest(p_assignees) a) x;
insert into public.activity_logs(post_id,actor_id,action,target_title) values(result,auth.uid(),case when p_id is null then 'created' else 'edited' end,p_title); return result; end$$;
-- Explicitly restrict new SECURITY DEFINER functions; PUBLIC execute is not safe.
revoke execute on function public.admin_scope(uuid,uuid),public.require_admin(),public.create_invitation(uuid),public.revoke_invitation(uuid),public.enqueue_join_request(uuid,uuid),public.request_membership(uuid),public.register_join_request(),public.admin_approvals(),public.approve_user(uuid,uuid),public.admin_users(),public.manage_user(uuid,public.member_role,boolean,uuid),public.save_department(uuid,text,boolean),public.admin_notices(),public.save_notice(uuid,text),public.disable_notice(uuid) from public,anon,authenticated;
grant execute on function public.admin_scope(uuid,uuid),public.create_invitation(uuid),public.revoke_invitation(uuid),public.request_membership(uuid),public.admin_approvals(),public.approve_user(uuid,uuid),public.admin_users(),public.manage_user(uuid,public.member_role,boolean,uuid),public.save_department(uuid,text,boolean),public.admin_notices(),public.save_notice(uuid,text),public.disable_notice(uuid) to authenticated;
commit;
