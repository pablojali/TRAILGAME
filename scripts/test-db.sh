#!/usr/bin/env bash
# Tests the Supabase migrations on throwaway LOCAL PostgreSQL databases (never a Supabase
# project): for each supabase/tests/*.test.sql, a fresh database with the Supabase stand-ins and
# every migration in order, then the test. Needs a running local PostgreSQL and psql; PGUSER etc.
# as usual. Usage: npm run db:test
set -euo pipefail
export PGOPTIONS="-c client_min_messages=notice"
cd "$(dirname "$0")/.."
DB=""
trap '[ -n "$DB" ] && dropdb --if-exists "$DB"' EXIT
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
for test in supabase/tests/*.test.sql; do
  DB="trailgame_test_$$"
  createdb "$DB"
  run supabase/tests/supabase_stub.sql
  for migration in supabase/migrations/*.sql; do run "$migration"; done
  cat supabase/tests/helpers.sql "$test" | psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null 2>&1 | sed -e "s/^.*NOTICE:  //"
  dropdb "$DB"
  DB=""
done
