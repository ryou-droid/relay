-- Add diagnostics without relaxing validation, RLS, privileges or atomic signup.
-- Apply once using the trusted SQL Editor / migration runner, after migration 001.
begin;
create or replace function public.register_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  failure_state text;
  failure_constraint text;
  failure_table text;
  failure_schema text;
begin
  insert into public.profiles(id,full_name,planned_department,position)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'planned_department',
    new.raw_user_meta_data->>'position'
  );
  return new;
exception when others then
  get stacked diagnostics
    failure_state = returned_sqlstate,
    failure_constraint = constraint_name,
    failure_table = table_name,
    failure_schema = schema_name;
  -- Do not log NEW, metadata, SQLERRM or PG_EXCEPTION_DETAIL (may contain PII).
  raise log 'Relay register_profile failed: SQLSTATE=%, constraint=%, table=%, schema=%',
    failure_state, failure_constraint, failure_table, failure_schema;
  raise; -- Preserve failure and roll back Auth insertion; never create a partial user.
end;
$$;
revoke execute on function public.register_profile() from public, anon, authenticated;
commit;
