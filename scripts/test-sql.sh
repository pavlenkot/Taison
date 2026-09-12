#!/usr/bin/env bash
# =====================================================================
#  Прогін supabase/schema.sql і supabase/tests.sql на одноразовому
#  PostgreSQL 16, який піднімається й зноситься тут же.
#
#  Схема — єдине місце, де живе логіка доступу до даних, тож перевіряти
#  її руками в Supabase SQL Editor означає перевіряти не завжди й не все.
#  Тут вона щоразу накочується на порожню базу: жоден залишок від
#  попереднього запуску не може випадково «полагодити» перевірку.
#
#  Запуск:  bash scripts/test-sql.sh
#  Код виходу 0 — усе зелене, будь-що інше — є падіння.
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_SQL="$ROOT/supabase/schema.sql"
TESTS_SQL="$ROOT/supabase/tests.sql"

PGBIN="${TAISON_PGBIN:-/usr/lib/postgresql/16/bin}"
# Каталог навмисно поза репозиторієм: сервер працює від службового
# користувача, а до шляхів усередині робочої теки він не має доступу
# на обхід каталогів і initdb падає ще до створення бази.
PGDIR="${TAISON_PGDIR:-/tmp/pgtest}"
PGPORT_T="${TAISON_PGPORT:-54329}"
PGUSER_OS="${TAISON_PGUSER:-pgtest}"

SERVER_UP=0

say()  { printf '%s\n' "$*"; }
head2() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
good() { printf '\033[32m%s\033[0m\n' "$*"; }

# Зупиняємо й зносимо інстанс у будь-якому разі: і коли тести впали,
# і коли скрипт перервали з клавіатури. Інакше наступний запуск
# спіткнеться об чужий каталог даних і зайнятий порт.
cleanup() {
  local rc=$?
  trap - EXIT
  if [ "$SERVER_UP" = 1 ]; then
    as_pg "$PGBIN/pg_ctl -D '$PGDIR/data' -m immediate stop" >/dev/null 2>&1 || true
  fi
  rm -rf "$PGDIR" 2>/dev/null || true
  exit "$rc"
}
trap cleanup EXIT INT TERM

# Postgres відмовляється стартувати від root, тож усе, що торкається
# каталогу даних, робимо від окремого користувача.
as_pg() {
  if [ "$(id -u)" -eq 0 ]; then
    su "$PGUSER_OS" -c "$1"
  else
    bash -c "$1"
  fi
}

psql_q() {
  psql -h "$PGDIR" -p "$PGPORT_T" -U postgres -d postgres -q -v ON_ERROR_STOP=1 "$@"
}

# --------------------------------------------------------------------
# 0. Передумови
# --------------------------------------------------------------------
head2 "Передумови"
for f in "$SCHEMA_SQL" "$TESTS_SQL"; do
  [ -r "$f" ] || { fail "немає файлу: $f"; exit 1; }
done
[ -x "$PGBIN/initdb" ] || { fail "не знайдено initdb у $PGBIN (задайте TAISON_PGBIN)"; exit 1; }
command -v psql >/dev/null || { fail "psql не в PATH"; exit 1; }
if [ "$(id -u)" -eq 0 ] && ! id "$PGUSER_OS" >/dev/null 2>&1; then
  fail "потрібен непривілейований користувач '$PGUSER_OS' (сервер не стартує від root)"
  exit 1
fi
say "postgres:  $("$PGBIN/initdb" --version)"
say "каталог:   $PGDIR (порт $PGPORT_T)"

# --------------------------------------------------------------------
# 1. Чистий інстанс
# --------------------------------------------------------------------
head2 "Піднімаємо одноразовий PostgreSQL"
rm -rf "$PGDIR"
mkdir -p "$PGDIR"
if [ "$(id -u)" -eq 0 ]; then
  chown -R "$PGUSER_OS":"$PGUSER_OS" "$PGDIR"
fi
chmod 750 "$PGDIR"

# Локаль потрібна саме UTF-8: під C класифікатор символів не вважає
# кирилицю літерами, і to_tsvector не зробить жодного токена з
# українських ключових слів — пошук у тестах впав би на рівному місці.
LOCALE_USED=""
for loc in C.utf8 C.UTF-8 en_US.utf8 C; do
  if as_pg "$PGBIN/initdb -D '$PGDIR/data' -U postgres --auth=trust -E UTF8 --locale=$loc" \
       > "$PGDIR/initdb.log" 2>&1; then
    LOCALE_USED="$loc"
    break
  fi
done
if [ -z "$LOCALE_USED" ]; then
  fail "initdb не відпрацював:"
  tail -20 "$PGDIR/initdb.log" >&2 || true
  exit 1
fi
say "локаль:    $LOCALE_USED"
case "$LOCALE_USED" in
  C|POSIX) fail "УВАГА: UTF-8 локалі немає, повнотекстовий пошук по кирилиці не працюватиме";;
esac

as_pg "$PGBIN/pg_ctl -D '$PGDIR/data' -o '-p $PGPORT_T -k $PGDIR' -l '$PGDIR/pg.log' start" >/dev/null 2>&1 || true
SERVER_UP=1

READY=0
for _ in $(seq 1 60); do
  if psql -h "$PGDIR" -p "$PGPORT_T" -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done
if [ "$READY" != 1 ]; then
  fail "сервер не піднявся:"
  tail -30 "$PGDIR/pg.log" >&2 || true
  exit 1
fi
say "сервер:    готовий"

# --------------------------------------------------------------------
# 2. Заглушки Supabase
# --------------------------------------------------------------------
# Схема посилається на auth.users, auth.uid(), storage.* і на ролі,
# яких у голому Postgres немає. Підміняємо їх рівно настільки, щоб
# перевірялася наша схема, а не платформа.
head2 "Заглушки Supabase (auth, storage, ролі)"
psql_q <<'SQL'
create role authenticated;
create role anon;
create role service_role;
create schema auth;
create schema storage;
create extension if not exists pgcrypto;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;
SQL
say "заглушки:  створено"

# --------------------------------------------------------------------
# 3. schema.sql — двічі
# --------------------------------------------------------------------
# Другий прогін — не формальність: у схемі повно alter ... add column
# if not exists і drop policy / create policy. Саме так її й накочують
# у Supabase — поверх уже наявної бази, тож повторний запуск має бути
# таким самим безпечним, як перший.
head2 "schema.sql (прогін 1 з 2)"
PGOPTIONS='-c client_min_messages=warning' psql_q -f "$SCHEMA_SQL"
say "прогін 1:  без помилок"

head2 "schema.sql (прогін 2 з 2 — ідемпотентність)"
PGOPTIONS='-c client_min_messages=warning' psql_q -f "$SCHEMA_SQL"
say "прогін 2:  без помилок"

# --------------------------------------------------------------------
# 4. Права ролі браузера
# --------------------------------------------------------------------
# Видаємо рівно те, що Supabase видає ролям anon/authenticated: доступ
# до схем і таблиць. Гуртового grant execute на функції тут НЕМАЄ
# свідомо — інакше він повернув би права, які schema.sql щойно відкликала
# з seed_default_categories() і handle_new_user(), і перевірка №2
# показувала б зелене на порожньому місці. Решта RPC і так викликається
# завдяки типовому для Postgres grant execute для PUBLIC.
head2 "Права ролей anon / authenticated"
psql_q <<'SQL'
grant usage on schema public to authenticated, anon;
grant usage on schema auth   to authenticated, anon;
grant all on all tables in schema public to authenticated;
SQL
say "права:     видано"

# --------------------------------------------------------------------
# 5. tests.sql
# --------------------------------------------------------------------
head2 "tests.sql"
OUT="$PGDIR/tests.out"
set +e
psql -h "$PGDIR" -p "$PGPORT_T" -U postgres -d postgres \
     -q -v ON_ERROR_STOP=1 -f "$TESTS_SQL" 2>&1 | tee "$OUT"
RC=${PIPESTATUS[0]}
set -e

PASSED=$(grep -cE 'NOTICE:[[:space:]]+ok: ' "$OUT" || true)

printf '\n%s\n' "-------------------------------------------------------------"
if [ "$RC" -eq 0 ]; then
  good "PASS — перевірок пройдено: $PASSED"
  say  "schema.sql: чисто, двічі поспіль"
  printf '%s\n' "-------------------------------------------------------------"
  exit 0
fi

fail "FAIL — перевірок пройшло: $PASSED, далі падіння:"
grep -E 'FAIL:|^ERROR:|ERROR:  ' "$OUT" | head -20 >&2 || true
printf '%s\n' "-------------------------------------------------------------"
exit 1
