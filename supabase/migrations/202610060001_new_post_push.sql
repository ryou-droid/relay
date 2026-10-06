-- New-post notifications only. Private subscriptions/outbox; API clients cannot read recipients.
begin;
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
 endpoint text not null unique check(char_length(endpoint)<=4096), p256dh text not null, auth_key text not null,
 application_server_key text not null, enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index push_subscriptions_user_enabled on public.push_subscriptions(user_id) where enabled;
create table public.push_outbox (
 id uuid primary key default gen_random_uuid(), kind text not null default 'new_post' check(kind='new_post'),
 post_id uuid not null references public.posts on delete cascade, subscription_id uuid not null references public.push_subscriptions on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','sent','skipped','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes', lease_id uuid, leased_until timestamptz,
 created_at timestamptz not null default now(), sent_at timestamptz,
 unique(kind,post_id,subscription_id)
);
create index push_outbox_pending on public.push_outbox(available_at,created_at) where status in ('pending','processing');
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_subscriptions,public.push_outbox from public,anon,authenticated;
grant select(id,user_id,endpoint,enabled,application_server_key) on public.push_subscriptions to authenticated;
create policy push_subscription_self on public.push_subscriptions for select to authenticated using(user_id=auth.uid());

create function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_key text) returns void
language plpgsql security definer set search_path='' as $$declare me public.memberships; existing public.push_subscriptions; begin
 select * into me from public.memberships where user_id=auth.uid() and status='active';
 if not found or not public.is_member(me.organization_id,me.department_id) then raise exception '所属確認が必要です'; end if;
 if p_endpoint is null or char_length(p_endpoint)>4096 or p_endpoint !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$'
 or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' or p_key is null or p_key !~ '^[A-Za-z0-9_-]{87}$' then raise exception '購読情報が無効です'; end if;
 select * into existing from public.push_subscriptions where endpoint=p_endpoint for update;
 if found and existing.user_id<>auth.uid() and (existing.p256dh<>p_p256dh or existing.auth_key<>p_auth) then raise exception '購読情報が無効です'; end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,application_server_key) values(auth.uid(),p_endpoint,p_p256dh,p_auth,p_key)
 on conflict(endpoint) do update set user_id=auth.uid(),p256dh=p_p256dh,auth_key=p_auth,application_server_key=p_key,enabled=true,updated_at=now();
end$$;
create function public.disable_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'ログインしてください'; end if;
 update public.push_subscriptions set enabled=false,updated_at=now() where user_id=auth.uid() and endpoint=p_endpoint;
end$$;

-- Internal eligibility helper: reevaluated at dispatch and notification display.
create function public.push_eligible(p_job uuid,p_key text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.push_outbox j join public.push_subscriptions s on s.id=j.subscription_id and s.user_id=j.user_id
 join public.posts p on p.id=j.post_id join public.memberships m on m.user_id=j.user_id and m.status='active' and m.organization_id=p.organization_id and m.department_id=p.department_id
 join public.profiles profile on profile.id=m.user_id join public.departments d on d.id=m.department_id and d.organization_id=m.organization_id
 where j.id=p_job and s.enabled and not profile.suspended and d.active and p.deleted_at is null and p.author_id<>j.user_id and j.expires_at>now()
 and (p_key is null or s.application_server_key=p_key))
$$;
create function public.enqueue_new_post_push() returns trigger
language plpgsql security definer set search_path='' as $$begin
 insert into public.push_outbox(post_id,subscription_id,user_id)
 select new.id,s.id,s.user_id from public.push_subscriptions s
 join public.memberships m on m.user_id=s.user_id and m.status='active' and m.organization_id=new.organization_id and m.department_id=new.department_id
 join public.profiles p on p.id=m.user_id join public.departments d on d.id=m.department_id and d.organization_id=m.organization_id
 where s.enabled and s.user_id<>new.author_id and not p.suspended and d.active and new.deleted_at is null;
 return new;
end$$;
create trigger enqueue_new_post_push after insert on public.posts for each row execute function public.enqueue_new_post_push();

-- Only the server worker (service_role) can claim device keys or acknowledge delivery.
create function public.claim_push_jobs(p_key text,p_post uuid default null,p_limit integer default 20)
returns table(job_id uuid,lease uuid,endpoint text,p256dh text,auth_key text,post_id uuid)
language plpgsql security definer set search_path='' as $$begin
 if p_limit<1 or p_limit>20 or p_limit is null then raise exception '取得条件が無効です'; end if;
 update public.push_outbox j set status='skipped',lease_id=null,leased_until=null
 where j.status in ('pending','processing') and (p_post is null or j.post_id=p_post)
 and (j.status='pending' or j.leased_until<now()) and (j.attempts>=5 or not public.push_eligible(j.id,p_key));
 return query with ready as (
 select j.id from public.push_outbox j where (p_post is null or j.post_id=p_post) and j.available_at<=now()
 and (j.status='pending' or (j.status='processing' and j.leased_until<now())) and j.attempts<5 and public.push_eligible(j.id,p_key)
 order by j.created_at limit p_limit for update skip locked), claimed as (
 update public.push_outbox j set status='processing',attempts=j.attempts+1,lease_id=gen_random_uuid(),leased_until=now()+interval '60 seconds'
 from ready r where j.id=r.id returning j.*)
 select c.id,c.lease_id,s.endpoint,s.p256dh,s.auth_key,c.post_id from claimed c join public.push_subscriptions s on s.id=c.subscription_id;
end$$;
create function public.authorize_push_job(p_id uuid,p_lease uuid,p_key text) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from public.push_outbox j where j.id=p_id and j.status='processing' and j.lease_id=p_lease and j.leased_until>now() and public.push_eligible(j.id,p_key))$$;
create function public.finish_push_job(p_id uuid,p_lease uuid,p_result text) returns void
language plpgsql security definer set search_path='' as $$declare j public.push_outbox; begin
 select * into j from public.push_outbox where id=p_id and status='processing' and lease_id=p_lease for update;
 if not found then return; end if;
 if p_result not in ('sent','retry','expired','skipped') or p_result is null then raise exception '結果が無効です'; end if;
 if p_result='expired' then update public.push_subscriptions set enabled=false,updated_at=now() where id=j.subscription_id and user_id=j.user_id; end if;
 update public.push_outbox set status=case when p_result='sent' then 'sent' when p_result='retry' and attempts<5 and expires_at>now() then 'pending' when p_result='retry' then 'failed' else 'skipped' end,
 available_at=now()+make_interval(secs=>least(240,30*power(2,attempts-1)::integer)),lease_id=null,leased_until=null,
 sent_at=case when p_result='sent' then now() else sent_at end where id=p_id;
end$$;
create function public.can_show_push(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from public.push_outbox j where j.id=p_id and j.user_id=auth.uid() and j.status in ('processing','sent') and public.push_eligible(j.id))$$;

revoke execute on function public.save_push_subscription(text,text,text,text),public.disable_push_subscription(text),public.push_eligible(uuid,text),public.enqueue_new_post_push(),public.claim_push_jobs(text,uuid,integer),public.authorize_push_job(uuid,uuid,text),public.finish_push_job(uuid,uuid,text),public.can_show_push(uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_push_subscription(text,text,text,text),public.disable_push_subscription(text),public.can_show_push(uuid) to authenticated;
grant execute on function public.claim_push_jobs(text,uuid,integer),public.authorize_push_job(uuid,uuid,text),public.finish_push_job(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
