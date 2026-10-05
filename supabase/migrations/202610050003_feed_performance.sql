-- Bounded feeds and read-only admin count. No existing migration/RLS is changed.
begin;
create index if not exists posts_feed_order on public.posts(department_id,created_at desc,id desc) where deleted_at is null;
create index if not exists posts_completed_order on public.posts(department_id,created_at desc,id desc) where deleted_at is null and status='completed';
create index if not exists posts_author_order on public.posts(department_id,author_id,created_at desc,id desc) where deleted_at is null;
create index if not exists posts_completed_date on public.posts(department_id,completed_at) where deleted_at is null and status='completed';
create index if not exists activity_actor_post on public.activity_logs(actor_id,post_id);
create index if not exists supplements_author_post on public.supplements(author_id,post_id);
create index if not exists assignees_user_post on public.post_assignees(user_id,post_id);
create index if not exists reads_user_post on public.post_reads(user_id,post_id);
create index if not exists invitations_org_active on public.organization_invitations(organization_id,created_at desc) where active;

create function public.feed_involved(p_id uuid,p_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_author=auth.uid()
 or exists(select 1 from public.post_assignees a where a.post_id=p_id and a.user_id=auth.uid())
 or exists(select 1 from public.post_reads r where r.post_id=p_id and r.user_id=auth.uid() and (r.confirmed_at is not null or r.accepted_at is not null))
 or exists(select 1 from public.supplements s where s.post_id=p_id and s.author_id=auth.uid())
 or exists(select 1 from public.activity_logs l where l.post_id=p_id and l.actor_id=auth.uid())
$$;

create function public.post_summaries_for(p_ids uuid[]) returns table(post_id uuid,read_count bigint,member_count bigint,is_read boolean,involved boolean,assignee_names text[])
language sql stable security definer set search_path='' as $$
 with me as materialized (
  select m.* from public.memberships m join public.profiles pr on pr.id=m.user_id
  join public.departments d on d.id=m.department_id and d.organization_id=m.organization_id
  where m.user_id=auth.uid() and m.status='active' and not pr.suspended and d.active
 ), members as materialized (
  select count(*) n from public.memberships m join public.profiles pr on pr.id=m.user_id
  where m.department_id=(select department_id from me) and m.status='active' and not pr.suspended
 )
 select p.id,(select count(*) from public.post_reads r where r.post_id=p.id),members.n,
 exists(select 1 from public.post_reads r where r.post_id=p.id and r.user_id=auth.uid()),
 public.feed_involved(p.id,p.author_id),
 array(select pr.full_name from public.post_assignees a join public.profiles pr on pr.id=a.user_id where a.post_id=p.id order by pr.full_name)
 from public.posts p join me on me.organization_id=p.organization_id and me.department_id=p.department_id cross join members
 where p.deleted_at is null and p.id=any(p_ids) and cardinality(p_ids)<=200
$$;

create function public.post_feed(p_view text,p_filter text,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me public.memberships; result jsonb; today_start timestamptz;
begin
 select m.* into me from public.memberships m where m.user_id=auth.uid() and m.status='active' and public.is_member(m.organization_id,m.department_id);
 if not found then raise exception '所属が必要です'; end if;
 if p_limit is null or p_limit<1 or p_limit>50 or (p_before is null)<>(p_before_id is null) then raise exception '取得条件が不正です'; end if;
 if p_view not in ('home','history') or p_view is null or p_filter is null
 or (p_view='home' and p_filter not in ('important','overdue','unread','progress','new','today'))
 or (p_view='history' and p_filter not in ('completed','mine','involved')) then raise exception '取得条件が不正です'; end if;
 today_start := date_trunc('day',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
 with involved_ids as materialized (
  select p.id post_id from public.posts p where p_view='history' and p_filter='involved' and p.department_id=me.department_id and p.author_id=auth.uid() and p.deleted_at is null
  union select a.post_id from public.post_assignees a where p_view='history' and p_filter='involved' and a.user_id=auth.uid()
  union select r.post_id from public.post_reads r where p_view='history' and p_filter='involved' and r.user_id=auth.uid() and (r.confirmed_at is not null or r.accepted_at is not null)
  union select s.post_id from public.supplements s where p_view='history' and p_filter='involved' and s.author_id=auth.uid()
  union select l.post_id from public.activity_logs l where p_view='history' and p_filter='involved' and l.actor_id=auth.uid()
 ), candidates as materialized (
  select p.id,p.title,p.kind,p.priority,p.status,p.due_at,p.created_at,p.completed_at
  from public.posts p where p.organization_id=me.organization_id and p.department_id=me.department_id and p.deleted_at is null
  and (p_before is null or (p.created_at,p.id)<(p_before,p_before_id))
  and case when p_view='home' then
   case p_filter when 'today' then p.status='completed' and p.completed_at>=today_start and p.completed_at<today_start+interval '1 day'
    when 'important' then p.status<>'completed' and p.priority='high'
    when 'overdue' then p.status<>'completed' and p.due_at<now()
    when 'unread' then p.status<>'completed' and not exists(select 1 from public.post_reads r where r.post_id=p.id and r.user_id=auth.uid())
    when 'progress' then p.status='in_progress' else p.status<>'completed' end
   else case p_filter when 'mine' then p.author_id=auth.uid() when 'involved' then p.id in (select post_id from involved_ids) else p.status='completed' end end
  order by p.created_at desc,p.id desc limit p_limit+1
 ), visible as materialized (select * from candidates order by created_at desc,id desc limit p_limit),
 summaries as (select * from public.post_summaries_for(array(select id from visible)))
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('post',to_jsonb(p),'summary',to_jsonb(s)) order by p.created_at desc,p.id desc) from visible p join summaries s on s.post_id=p.id),'[]'::jsonb),
  'next',case when (select count(*) from candidates)>p_limit then (select jsonb_build_object('created_at',created_at,'id',id) from visible order by created_at,id limit 1) else null end) into result;
 return result;
end$$;

create function public.home_feed() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(category,public.post_feed('home',category))
 from unnest(array['important','overdue','unread','progress','new','today']) category
$$;

create function public.admin_dashboard() returns table(pending_count bigint)
language plpgsql stable security definer set search_path='' as $$declare me public.memberships; begin
 me := public.check_admin_read();
 return query select count(*) from public.join_requests r join public.profiles p on p.id=r.user_id
 where r.status='pending' and not p.suspended and r.organization_id=me.organization_id
 and (me.role='organization_admin' or r.department_id=me.department_id);
end$$;
revoke execute on function public.feed_involved(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.post_summaries_for(uuid[]),public.post_feed(text,text,timestamptz,uuid,integer),public.home_feed(),public.admin_dashboard() from public,anon;
grant execute on function public.post_summaries_for(uuid[]),public.post_feed(text,text,timestamptz,uuid,integer),public.home_feed(),public.admin_dashboard() to authenticated;
notify pgrst,'reload schema';
commit;
