-- Reduce startup payload while preserving instant category switches and keyset pagination.
-- Apply after 202610050003_feed_performance.sql. No table/policy/identity changes.
create or replace function public.home_feed() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(category,public.post_feed('home',category,null,null,15))
 from unnest(array['important','overdue','unread','progress','new','today']) category
$$;
revoke execute on function public.home_feed() from public,anon;
grant execute on function public.home_feed() to authenticated;
notify pgrst, 'reload schema';
