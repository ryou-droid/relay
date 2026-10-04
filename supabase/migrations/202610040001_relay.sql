begin;
create type public.member_role as enum ('user','department_admin','organization_admin');
create type public.post_status as enum ('pending','in_progress','completed');
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null check(char_length(name) between 1 and 100),created_at timestamptz not null default now());
create table public.departments(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,name text not null check(char_length(name) between 1 and 100),unique(id,organization_id));
create table public.profiles(id uuid primary key references auth.users on delete cascade,full_name text not null check(char_length(full_name) between 1 and 80),planned_department text not null check(char_length(planned_department) between 1 and 100),position text not null check(char_length(position) between 1 and 100),created_at timestamptz not null default now());
create table public.memberships(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles,organization_id uuid not null references public.organizations,department_id uuid not null,role public.member_role not null default 'user',status text not null default 'pending' check(status in ('pending','active','revoked')),foreign key(department_id,organization_id) references public.departments(id,organization_id),unique(user_id,department_id));
create unique index one_active_membership on public.memberships(user_id) where status='active';
create table public.posts(id uuid primary key default gen_random_uuid(),organization_id uuid not null,department_id uuid not null,author_id uuid not null references public.profiles,kind text not null check(kind in ('notice','caution','handover','request')),priority text not null default 'normal' check(priority in ('low','normal','high')),title text not null check(char_length(title) between 1 and 30),body text not null check(char_length(body) between 1 and 300),due_at timestamptz not null,status public.post_status not null default 'pending',accepted_at timestamptz,completed_at timestamptz,deleted_at timestamptz,created_at timestamptz not null default now(),foreign key(department_id,organization_id) references public.departments(id,organization_id));
create table public.post_assignees(post_id uuid not null references public.posts,user_id uuid not null references public.profiles,primary key(post_id,user_id));
create table public.post_reads(post_id uuid not null references public.posts,user_id uuid not null references public.profiles,read_at timestamptz not null default now(),confirmed_at timestamptz,accepted_at timestamptz,primary key(post_id,user_id));
create table public.supplements(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,author_id uuid not null references public.profiles,body text not null check(char_length(body) between 1 and 100),created_at timestamptz not null default now(),deleted_at timestamptz);
create table public.activity_logs(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,actor_id uuid not null references public.profiles,action text not null,from_status public.post_status,to_status public.post_status,target_id uuid,target_title text,created_at timestamptz not null default now());
create table public.important_notices(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,department_id uuid,body text not null check(char_length(body) between 1 and 500),author_id uuid not null references public.profiles,active boolean not null default true,created_at timestamptz not null default now(),foreign key(department_id,organization_id) references public.departments(id,organization_id));
create unique index one_org_notice on public.important_notices(organization_id) where active and department_id is null;
create unique index one_dept_notice on public.important_notices(department_id) where active and department_id is not null;
create index posts_department_due on public.posts(department_id,due_at) where deleted_at is null;
create index supplements_post on public.supplements(post_id);
create index activity_post on public.activity_logs(post_id,created_at);
create index membership_department on public.memberships(department_id) where status='active';

create function public.is_member(org uuid,dept uuid default null) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.status='active' and m.organization_id=org and (dept is null or m.department_id=dept))$$;
create function public.can_read_post(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.posts p where p.id=pid and p.deleted_at is null and public.is_member(p.organization_id,p.department_id))$$;
create function public.register_profile() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id,full_name,planned_department,position) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'planned_department',new.raw_user_meta_data->>'position'); return new; end$$;
create trigger register_profile after insert on auth.users for each row execute function public.register_profile();

alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.posts enable row level security;
alter table public.post_assignees enable row level security;
alter table public.post_reads enable row level security;
alter table public.supplements enable row level security;
alter table public.activity_logs enable row level security;
alter table public.important_notices enable row level security;
create policy org_read on public.organizations for select to authenticated using(public.is_member(id));
create policy dept_read on public.departments for select to authenticated using(public.is_member(organization_id,id));
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy membership_self on public.memberships for select to authenticated using(user_id=auth.uid());
create policy posts_read on public.posts for select to authenticated using(deleted_at is null and public.is_member(organization_id,department_id));
create policy assignees_read on public.post_assignees for select to authenticated using(public.can_read_post(post_id));
-- Reader identities are deliberately never SELECTable by regular authenticated users.
create policy supplements_read on public.supplements for select to authenticated using(deleted_at is null and public.can_read_post(post_id));
create policy logs_read on public.activity_logs for select to authenticated using(public.can_read_post(post_id));
create policy notices_read on public.important_notices for select to authenticated using(active and public.is_member(organization_id,department_id));

-- All mutations go through narrowly scoped RPCs. No client table write grants.
revoke all on public.organizations,public.departments,public.profiles,public.memberships,public.posts,public.post_assignees,public.post_reads,public.supplements,public.activity_logs,public.important_notices from anon,authenticated;
grant select on public.organizations,public.departments,public.profiles,public.memberships,public.posts,public.post_assignees,public.post_reads,public.supplements,public.activity_logs,public.important_notices to authenticated;
create function public.department_members() returns table(user_id uuid,display_name text) language sql stable security definer set search_path='' as $$select p.id,p.full_name from public.profiles p join public.memberships m on m.user_id=p.id where m.status='active' and exists(select 1 from public.memberships me where me.user_id=auth.uid() and me.status='active' and me.organization_id=m.organization_id and me.department_id=m.department_id) order by p.full_name$$;
create function public.post_summaries() returns table(post_id uuid,read_count bigint,member_count bigint,is_read boolean,involved boolean,assignee_names text[]) language sql stable security definer set search_path='' as $$select p.id,(select count(*) from public.post_reads r where r.post_id=p.id),(select count(*) from public.memberships m where m.department_id=p.department_id and m.status='active'),exists(select 1 from public.post_reads r where r.post_id=p.id and r.user_id=auth.uid()),(p.author_id=auth.uid() or exists(select 1 from public.post_assignees a where a.post_id=p.id and a.user_id=auth.uid()) or exists(select 1 from public.post_reads r where r.post_id=p.id and r.user_id=auth.uid() and (r.confirmed_at is not null or r.accepted_at is not null)) or exists(select 1 from public.supplements s where s.post_id=p.id and s.author_id=auth.uid()) or exists(select 1 from public.activity_logs l where l.post_id=p.id and l.actor_id=auth.uid())),array(select pr.full_name from public.post_assignees a join public.profiles pr on pr.id=a.user_id where a.post_id=p.id) from public.posts p where p.deleted_at is null and public.is_member(p.organization_id,p.department_id)$$;
create function public.save_post(p_id uuid,p_title text,p_body text,p_kind text,p_priority text,p_due_at timestamptz,p_assignees uuid[]) returns uuid language plpgsql security definer set search_path='' as $$declare m public.memberships; p public.posts; result uuid; begin
select * into m from public.memberships where user_id=auth.uid() and status='active'; if not found then raise exception '組織への参加が必要です'; end if;
if p_id is not null then select * into p from public.posts where id=p_id for update; if not found or not public.can_read_post(p_id) or p.author_id<>auth.uid() or p.accepted_at is not null then raise exception '編集できません'; end if; end if;
if exists(select 1 from unnest(p_assignees) a where not exists(select 1 from public.memberships x where x.user_id=a and x.department_id=m.department_id and x.organization_id=m.organization_id and x.status='active')) then raise exception '担当者は同じ部署から選択してください'; end if;
if p_id is null then insert into public.posts(organization_id,department_id,author_id,title,body,kind,priority,due_at) values(m.organization_id,m.department_id,auth.uid(),p_title,p_body,p_kind,p_priority,p_due_at) returning id into result;
else result:=p_id; update public.posts set title=p_title,body=p_body,kind=p_kind,priority=p_priority,due_at=p_due_at where id=p_id; delete from public.post_assignees where post_id=p_id; end if;
insert into public.post_assignees select result,a from (select distinct unnest(p_assignees) a) x;
insert into public.activity_logs(post_id,actor_id,action,target_title) values(result,auth.uid(),case when p_id is null then 'created' else 'edited' end,p_title); return result; end$$;
create function public.post_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$declare p public.posts; next_status public.post_status; begin
select * into p from public.posts where id=p_id for update;
if not found or not public.can_read_post(p_id) then raise exception '閲覧権限がありません'; end if;
if p_action in ('read','confirm','accept') then
insert into public.post_reads(post_id,user_id,confirmed_at,accepted_at) values(p_id,auth.uid(),case when p_action='confirm' then now() end,case when p_action='accept' then now() end) on conflict(post_id,user_id) do update set confirmed_at=coalesce(public.post_reads.confirmed_at,excluded.confirmed_at),accepted_at=coalesce(public.post_reads.accepted_at,excluded.accepted_at);
end if;
if p_action='read' then return; end if;
if p_action='confirm' then insert into public.activity_logs(post_id,actor_id,action) values(p_id,auth.uid(),'confirmed'); return; end if;
if p_action='delete' then if p.author_id<>auth.uid() then raise exception '自分の投稿のみ削除できます'; end if; update public.posts set deleted_at=now() where id=p_id; insert into public.activity_logs(post_id,actor_id,action,target_id,target_title) values(p_id,auth.uid(),'deleted_post',p_id,p.title); return; end if;
if p_action='accept' then next_status:=case when p.status='pending' then 'in_progress'::public.post_status else p.status end;
elsif p_action='complete' then next_status:='completed'; elsif p_action='pending' then next_status:='pending'; elsif p_action='in_progress' then next_status:='in_progress'; else raise exception '不正な操作です'; end if;
update public.posts set status=next_status,accepted_at=case when p_action='accept' then coalesce(accepted_at,now()) else accepted_at end,completed_at=case when next_status='completed' then coalesce(completed_at,now()) else null end where id=p_id;
if p.status<>next_status or p_action='accept' then insert into public.activity_logs(post_id,actor_id,action,from_status,to_status) values(p_id,auth.uid(),case when p_action='accept' then 'accepted' else 'status_changed' end,p.status,next_status); end if; end$$;
create function public.add_supplement(p_id uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$declare sid uuid; begin
perform 1 from public.posts where id=p_id for update; if not public.can_read_post(p_id) then raise exception '閲覧権限がありません'; end if;
insert into public.supplements(post_id,author_id,body) values(p_id,auth.uid(),p_body) returning id into sid; insert into public.activity_logs(post_id,actor_id,action,target_id) values(p_id,auth.uid(),'added_supplement',sid); end$$;
create function public.delete_supplement(s_id uuid) returns void language plpgsql security definer set search_path='' as $$declare s public.supplements; begin
select * into s from public.supplements where id=s_id for update; if not found or s.author_id<>auth.uid() or s.deleted_at is not null or not public.can_read_post(s.post_id) then raise exception '削除できません'; end if;
update public.supplements set deleted_at=now() where id=s_id; insert into public.activity_logs(post_id,actor_id,action,target_id,target_title) values(s.post_id,auth.uid(),'deleted_supplement',s_id,s.body); end$$;
-- Explicit allowlist: future functions must also opt in to execution.
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.is_member(uuid,uuid),public.can_read_post(uuid),public.department_members(),public.post_summaries(),public.save_post(uuid,text,text,text,text,timestamptz,uuid[]),public.post_action(uuid,text),public.add_supplement(uuid,text),public.delete_supplement(uuid) to authenticated;
commit;
