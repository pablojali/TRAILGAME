#!/usr/bin/env bash
# Tests the Supabase migrations on a throwaway LOCAL PostgreSQL database (never a Supabase
# project): Supabase stand-ins, every migration in order, then supabase/tests/*.test.sql.
# Needs a running local PostgreSQL and psql; PGUSER etc. as usual. Usage: npm run db:test
set -euo pipefail
export PGOPTIONS="-c client_min_messages=notice"
cd "$(dirname "$0")/.."
DB="trailgame_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/supabase_stub.sql
for migration in supabase/migrations/*.sql; do run "$migration"; done
for test in supabase/tests/*.test.sql; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f "$test" 2>&1 | sed -e "s/^.*NOTICE:  //"; done
