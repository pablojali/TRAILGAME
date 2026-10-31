-- Shared helpers for the database tests (loaded before each *.test.sql by scripts/test-db.sh).
create function pg_temp.act_as(who text) returns void language plpgsql as $$
begin
  if who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', false);
    execute 'set role anon';
  elsif who = 'service' then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
    execute 'set role service_role';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, false);
    execute 'set role authenticated';
  end if;
end $$;

-- Fails the run unless the statement raises an error.
create function pg_temp.expect_error(statement text, label text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'FAILED: % (no error)', label;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  raise notice 'ok: % (%)', label, sqlerrm;
end $$;

create function pg_temp.expect(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- A career snapshot with the fields the database checks.
create function pg_temp.snapshot(coins int, entries jsonb, owned jsonb, xp int default 350) returns jsonb language sql as $$
  select jsonb_build_object(
    'athlete', jsonb_build_object('name', 'Ana', 'profile', 'climber', 'xp', xp),
    'week', '{"number":3,"currentDayIndex":2,"days":[{},{},{},{},{},{},{}]}'::jsonb,
    'coins', coins, 'raceEntries', entries, 'equipment', '[]'::jsonb, 'ownedEquipment', owned)
$$;
