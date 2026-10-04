-- 開発用：最初の組織・部署へ、登録済みユーザーを正式所属させます。
-- 先にRelayの登録画面から登録してください（profilesが必要です）。
-- 下のメールアドレスを自分のテストアカウントへ変更して実行します。
-- 2人を同部署に入れる場合は、配列へもう1つの登録済みメールを追加できます。
begin;
do $$
declare
  test_emails text[] := array['your-test-email@example.com'];
  test_email text;
  test_user uuid;
  org_id constant uuid := '10000000-0000-4000-8000-000000000001';
  dept_id constant uuid := '20000000-0000-4000-8000-000000000001';
begin
  insert into public.organizations(id, name)
  values(org_id, 'Relayテスト組織') on conflict (id) do nothing;
  insert into public.departments(id, organization_id, name)
  values(dept_id, org_id, 'テスト部署') on conflict (id) do nothing;
  foreach test_email in array test_emails loop
    select u.id into test_user from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(test_email);
    if test_user is null then
      raise exception 'Relayから登録済みのユーザーが見つかりません: %', test_email;
    end if;
    if exists(select 1 from public.memberships
      where user_id=test_user and status='active' and department_id<>dept_id) then
      raise exception 'すでに別部署へ所属しています: %', test_email;
    end if;
    insert into public.memberships(user_id,organization_id,department_id,role,status)
    values(test_user,org_id,dept_id,'user','active')
    on conflict(user_id,department_id) do update set status='active';
  end loop;
end $$;
commit;
