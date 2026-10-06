-- OPERATOR ONLY: edit both placeholders before running ONCE in Supabase SQL Editor.
-- No real tokens are stored in Git. The token must match Vercel PUSH_DISPATCH_TOKEN.
-- Requires Supabase Cron, pg_net and Vault. Do not run on another project's database.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('https://relay-rouge-alpha.vercel.app/api/push/dispatch','relay_push_dispatch_url');
select vault.create_secret('REPLACE_WITH_PUSH_DISPATCH_TOKEN','relay_push_dispatch_token');
select cron.schedule('relay-new-post-push','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='relay_push_dispatch_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='relay_push_dispatch_token')),
    body := '{}'::jsonb, timeout_milliseconds := 30000
  );
$job$);
