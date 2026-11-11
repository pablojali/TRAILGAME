-- Sunday Major, phase 3 follow-up: the scheduler's tick (owner specification §7). Every 10 seconds
-- pg_cron calls the Edge Function `major-ops` (action `tick`) through pg_net with a secret that is
-- generated here and kept in Vault: nobody, the repository included, ever sees it. The function
-- asks `major_tick_check` whether the secret it received is the right one.
-- Skipped where Vault, pg_net or pg_cron do not exist (the local test database).

create or replace function public.major_tick_check(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null or p_secret is null or length(p_secret) < 32 then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'major_tick_secret' and decrypted_secret = p_secret);
end;
$$;
revoke all on function public.major_tick_check(text) from public, anon, authenticated;
grant execute on function public.major_tick_check(text) to service_role;

do $$
begin
  if to_regclass('vault.secrets') is null
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  create extension if not exists pg_net;
  if not exists (select 1 from vault.secrets where name = 'major_tick_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'major_tick_secret', 'Sunday Major scheduler tick');
  end if;
  perform cron.schedule(
    'major-tick',
    '10 seconds',
    $job$
    select net.http_post(
      url := 'https://zalyfrjfmsirvsrkdroy.supabase.co/functions/v1/major-ops',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-major-tick', (select decrypted_secret from vault.decrypted_secrets where name = 'major_tick_secret')
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 20000
    )
    $job$
  );
end $$;
