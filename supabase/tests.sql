-- =====================================================================
--  Taison — перевірки схеми бази даних.
--
--  Файл розрахований на свіжу базу, яку підготував scripts/test-sql.sh:
--  заглушки Supabase, виконана schema.sql, видані права ролям
--  anon/authenticated. Наживо в Supabase його запускати не можна —
--  він створює користувачів і дані.
--
--  Перевіряємо не «чи виконався запит», а поведінку, на яку спирається
--  застосунок: ізоляцію між акаунтами, недоступність службових функцій
--  ззовні та арифметику повторів і платежів.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Інструмент
-- ---------------------------------------------------------------------

-- Перевірка мусить кидати виняток, а не друкувати таблицю: інакше
-- зламану умову видно лише тому, хто уважно читає вивід, а psql і CI
-- вважатимуть такий запуск успішним.
create or replace function public.assert(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  -- Саме `is not true`, а не `not`: null з count/порівняння інакше
  -- проскочив би як «не помилка».
  if p_condition is not true then
    raise exception 'FAIL: %', p_what;
  end if;
  raise notice 'ok: %', p_what;
end $$;

-- Заборону перевіряємо за кодом стану, а не за самим фактом помилки:
-- запит може впасти через одруківку в назві стовпця, і тест зеленів би
-- навіть тоді, коли захист зник.
create or replace function public.assert_denied(p_sql text, p_what text)
returns void language plpgsql as $$
declare
  v_code text;
  v_msg  text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text;
    if v_code <> '42501' then
      raise exception 'FAIL: % — чекали на 42501, отримали % (%)', p_what, v_code, v_msg;
    end if;
    raise notice 'ok: %', p_what;
    return;
  end;
  raise exception 'FAIL: % — запит пройшов, хоча мав бути відхилений', p_what;
end $$;

\echo ''
\echo '--- 1. Засів категорій новому користувачу ---'

-- Тригер on_auth_user_created висить на auth.users, тож єдиний спосіб
-- перевірити його — створити користувача так само, як це робить GoTrue.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anna@taison.test'),
  ('22222222-2222-2222-2222-222222222222', 'borys@taison.test');

do $$
declare
  v_a_all int; v_a_exp int; v_a_inc int; v_b_all int; v_slugs int;
begin
  select count(*) filter (where true),
         count(*) filter (where kind = 'expense'),
         count(*) filter (where kind = 'income'),
         count(distinct slug)
    into v_a_all, v_a_exp, v_a_inc, v_slugs
    from public.categories
   where user_id = '11111111-1111-1111-1111-111111111111';

  select count(*) into v_b_all
    from public.categories
   where user_id = '22222222-2222-2222-2222-222222222222';

  perform public.assert(v_a_all = 20, format('новий користувач отримує 20 категорій (маємо %s)', v_a_all));
  perform public.assert(v_a_exp = 14, format('з них 14 витратних (маємо %s)', v_a_exp));
  perform public.assert(v_a_inc = 6,  format('з них 6 дохідних (маємо %s)', v_a_inc));
  perform public.assert(v_slugs = 20, 'усі слаги категорій різні');
  perform public.assert(v_b_all = 20, 'другий користувач засівається незалежно від першого');
end $$;

-- on conflict do nothing у seed_default_categories існує саме для
-- повторного виклику: інакше ручний перезапуск засіву впав би на
-- унікальному (user_id, slug) і зіпсував транзакцію виклику.
do $$
declare v_after int;
begin
  perform public.seed_default_categories('11111111-1111-1111-1111-111111111111');
  select count(*) into v_after from public.categories
   where user_id = '11111111-1111-1111-1111-111111111111';
  perform public.assert(v_after = 20, format('повторний засів нічого не дублює (маємо %s)', v_after));
end $$;

\echo ''
\echo '--- 2. Службові функції недосяжні з браузера ---'

-- Через PostgREST усе зі схеми public стає RPC. seed_default_categories
-- бере користувача параметром і є security definer, тож без відкликання
-- прав будь-хто з анонімним ключем дописував би рядки в чужий акаунт.
do $$
begin
  perform public.assert(
    not has_function_privilege('authenticated', 'public.seed_default_categories(uuid)', 'execute'),
    'authenticated не має execute на seed_default_categories(uuid)');
  perform public.assert(
    not has_function_privilege('anon', 'public.seed_default_categories(uuid)', 'execute'),
    'anon не має execute на seed_default_categories(uuid)');
  perform public.assert(
    not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
    'authenticated не має execute на handle_new_user()');
  perform public.assert(
    not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
    'anon не має execute на handle_new_user()');
  -- Контрольний зразок: якби відкликання зачепило все підряд, застосунок
  -- лишився б без жодного RPC і перевірки нижче були б безглузді.
  perform public.assert(
    has_function_privilege('authenticated', 'public.search_documents(text)', 'execute'),
    'звичайні RPC (search_documents) лишаються доступними');
  perform public.assert(
    has_function_privilege('authenticated', 'public.google_connection_status()', 'execute'),
    'google_connection_status доступний authenticated');
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.assert_denied(
  $q$select public.seed_default_categories('22222222-2222-2222-2222-222222222222')$q$,
  'виклик seed_default_categories під authenticated відхилено');
select public.assert_denied(
  $q$select public.handle_new_user()$q$,
  'виклик handle_new_user під authenticated відхилено');
reset role;

set role anon;
select public.assert_denied(
  $q$select public.seed_default_categories('22222222-2222-2222-2222-222222222222')$q$,
  'виклик seed_default_categories під anon відхилено');
select public.assert_denied(
  $q$select public.handle_new_user()$q$,
  'виклик handle_new_user під anon відхилено');
reset role;

\echo ''
\echo '--- 3. Дані для перевірок ізоляції, пошуку й аналітики ---'

-- Готуємо все від власника схеми: RLS його не обмежує, тож видно, що
-- далі рядки ховає саме політика, а не невдалий insert.
insert into public.transactions (user_id, kind, amount_cents, category_id, merchant, occurred_on, needs_review)
values
  ('11111111-1111-1111-1111-111111111111', 'expense', 1000,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'groceries'),
   'Rewe', '2024-03-05', false),
  ('11111111-1111-1111-1111-111111111111', 'expense', 2500,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'groceries'),
   'Aldi', '2024-03-06', false),
  ('11111111-1111-1111-1111-111111111111', 'expense', 700,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'dining'),
   'Kebab', '2024-03-07', false),
  -- Непідтверджений скан: у підсумках його бути не має, інакше цифри
  -- стрибали б щоразу, коли модель розпізнала чек, а людина ще не глянула.
  ('11111111-1111-1111-1111-111111111111', 'expense', 9999,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'groceries'),
   'Скан у черзі', '2024-03-08', true),
  ('11111111-1111-1111-1111-111111111111', 'income', 300000,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'salary'),
   'Роботодавець', '2024-03-09', false),
  -- Без категорії: перевіряє гілку coalesce у period_totals.
  ('11111111-1111-1111-1111-111111111111', 'expense', 4300, null, 'Кіоск', '2024-03-10', false),
  -- Поза діапазоном звіту.
  ('11111111-1111-1111-1111-111111111111', 'expense', 5000,
   (select id from public.categories where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'groceries'),
   'Lidl', '2024-04-02', false),
  -- Чужа витрата того самого дня й тієї самої категорії.
  ('22222222-2222-2222-2222-222222222222', 'expense', 4242,
   (select id from public.categories where user_id = '22222222-2222-2222-2222-222222222222' and slug = 'groceries'),
   'Rewe', '2024-03-05', false);

insert into public.documents
  (id, user_id, doc_type, issuer, issuer_slug, subject, reference_number,
   document_date, keywords, body_text, language)
values
  ('d0c00001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'tax', 'Finanzamt', 'finanzamt', 'Einkommensteuerbescheid', 'AZ-2025/4471-B',
   '2025-02-10', array['податкова', 'рішення'],
   'Zahlung bis zum Ende des Monats erforderlich', 'de'),
  -- Те саме відомство, написане інакше: слаг у них спільний.
  ('d0c00002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'tax', 'FINANZAMT', 'finanzamt', 'Mahnung', 'AZ-2025/9902-C',
   '2025-03-01', array['нагадування'],
   'Erinnerung an eine offene Forderung', 'de'),
  ('d0c00003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'government', 'Jobcenter', 'jobcenter', 'Bewilligung', 'JC-7781',
   '2025-01-15', array['допомога'], 'Bewilligungsbescheid liegt bei', 'de'),
  -- Скан, у якому модель не впізнала адресата.
  ('d0c00004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'other', null, null, 'Скан без адресата', null,
   '2025-04-01', array[]::text[], 'Невідомий папір', 'uk'),
  -- Документ іншого користувача, навмисно схожий на d0c00001 за всіма
  -- трьома шляхами пошуку: словом, уривком номера і ключовим словом.
  ('d0c000b1-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222',
   'tax', 'Finanzamt', 'finanzamt', 'Einkommensteuerbescheid', 'AZ-2025/4471-B',
   '2025-02-10', array['податкова'],
   'Zahlung bis zum Ende des Monats erforderlich', 'de');

insert into public.google_credentials (user_id, google_email, refresh_token_enc, drive_root_id)
values ('11111111-1111-1111-1111-111111111111', 'anna@gmail.test', 'enc:xxx', 'root-1');

\echo ''
\echo '--- 4. RLS: кожен бачить лише своє ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare v_tx int; v_doc int; v_cat int; v_foreign int; v_touched int;
begin
  select count(*) into v_tx  from public.transactions;
  select count(*) into v_doc from public.documents;
  select count(*) into v_cat from public.categories;

  perform public.assert(v_tx  = 7,  format('А бачить 7 своїх операцій (маємо %s)', v_tx));
  perform public.assert(v_doc = 4,  format('А бачить 4 свої документи (маємо %s)', v_doc));
  perform public.assert(v_cat = 20, format('А бачить 20 своїх категорій (маємо %s)', v_cat));

  select count(*) into v_foreign from public.transactions
   where user_id <> '11111111-1111-1111-1111-111111111111';
  perform public.assert(v_foreign = 0, 'жодного чужого рядка в transactions не видно');

  -- Чужий рядок не просто невидимий — його не можна й змінити наосліп.
  update public.documents set subject = 'підмінено'
   where id = 'd0c000b1-0000-0000-0000-0000000000b1';
  get diagnostics v_touched = row_count;
  perform public.assert(v_touched = 0, 'update по чужому документу не зачіпає жодного рядка');
end $$;

-- with check у політиці — окрема від using половина: без неї можна було б
-- дописати рядок у чужий акаунт, не бачачи його.
select public.assert_denied(
  $q$insert into public.transactions (user_id, kind, amount_cents)
     values ('22222222-2222-2222-2222-222222222222', 'expense', 100)$q$,
  'insert у transactions з чужим user_id відхилено');
select public.assert_denied(
  $q$insert into public.documents (user_id, subject)
     values ('22222222-2222-2222-2222-222222222222', 'підкинутий')$q$,
  'insert у documents з чужим user_id відхилено');
select public.assert_denied(
  $q$insert into public.categories (user_id, name, slug)
     values ('22222222-2222-2222-2222-222222222222', 'Чуже', 'foreign')$q$,
  'insert у categories з чужим user_id відхилено');

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$
declare v_tx int; v_doc int;
begin
  select count(*) into v_tx  from public.transactions;
  select count(*) into v_doc from public.documents;
  perform public.assert(v_tx  = 1, format('Б бачить 1 свою операцію (маємо %s)', v_tx));
  perform public.assert(v_doc = 1, format('Б бачить 1 свій документ (маємо %s)', v_doc));
end $$;
reset role;

\echo ''
\echo '--- 5. google_credentials недосяжна з браузера ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

-- Таблиця під RLS без жодної політики: навіть власний рядок не видно.
-- Refresh-токен Диска має читати тільки сервер із ключем service_role.
do $$
declare v_rows int; v_status boolean;
begin
  select count(*) into v_rows from public.google_credentials;
  perform public.assert(v_rows = 0,
    format('authenticated не бачить жодного рядка google_credentials, навіть свій (маємо %s)', v_rows));

  -- А от стан підключення показати треба — для цього і є окрема
  -- security definer функція, яка не віддає самих токенів.
  select connected into v_status from public.google_connection_status();
  perform public.assert(v_status, 'google_connection_status повертає стан попри закриту таблицю');
end $$;

select public.assert_denied(
  $q$insert into public.google_credentials (user_id, refresh_token_enc)
     values ('11111111-1111-1111-1111-111111111111', 'enc:підміна')$q$,
  'insert у google_credentials відхилено навіть для власного user_id');

reset role;

\echo ''
\echo '--- 6. complete_task: повтори не тягнуть прострочення за собою ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

-- Усе рахуємо від current_date, а не від записаних дат: інакше набір
-- перевірок був би зеленим лише того дня тижня, коли його писали.
do $$
declare v_task uuid; v_new uuid; v_next date; v_arch timestamptz; v_done timestamptz;
begin
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Щоденне вчасно', current_date, 'daily')
  returning id into v_task;

  v_new := public.complete_task(v_task);
  select due_on into v_next from public.tasks where id = v_new;
  select archived_at, done_at into v_arch, v_done from public.tasks where id = v_task;

  perform public.assert(v_next = current_date + 1,
    format('daily вчасно -> завтра (маємо %s, чекали %s)', v_next, current_date + 1));
  perform public.assert(v_arch is not null, 'завершене завдання йде в архів (archived_at заповнено)');
  perform public.assert(v_done is not null, 'завершене завдання має done_at');
end $$;

do $$
declare v_task uuid; v_new uuid; v_next date; v_due date;
begin
  -- Найважливіший випадок. Раніше відлік ішов від due_on, і закриття
  -- забутого щоденного завдання народжувало ще одне прострочене:
  -- щоб дійти до сьогодні, його довелося б закрити 38 разів.
  v_due := current_date - 38;
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Щоденне забуте', v_due, 'daily')
  returning id into v_task;

  v_new := public.complete_task(v_task);
  select due_on into v_next from public.tasks where id = v_new;

  perform public.assert(v_next = current_date + 1,
    format('daily прострочене на 38 днів -> завтра (маємо %s)', v_next));
  perform public.assert(v_next <> v_due + 1,
    'daily прострочене НЕ відраховує від due_on, інакше повтор лишався б простроченим');
end $$;

do $$
declare v_task uuid; v_new uuid; v_next date; v_due date; i int;
begin
  -- Тиждень має триматися свого дня: «щопонеділка» не можна тихо
  -- перетворити на «щочетверга» лише тому, що завдання забули закрити.
  for i in 0..20 loop
    v_due := current_date - i;
    insert into public.tasks (user_id, title, due_on, repeat)
    values ('11111111-1111-1111-1111-111111111111', format('Тижневе -%s', i), v_due, 'weekly')
    returning id into v_task;

    v_new := public.complete_task(v_task);
    select due_on into v_next from public.tasks where id = v_new;

    perform public.assert(
      extract(isodow from v_next) = extract(isodow from v_due),
      format('weekly прострочене на %s дн. зберігає день тижня (%s -> %s)', i, v_due, v_next));
    perform public.assert(v_next > current_date,
      format('weekly прострочене на %s дн. дає дату в майбутньому (%s)', i, v_next));
  end loop;
end $$;

do $$
declare v_task uuid; v_new uuid; v_next date;
begin
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Тижневе вчасно', current_date, 'weekly')
  returning id into v_task;
  v_new := public.complete_task(v_task);
  select due_on into v_next from public.tasks where id = v_new;
  perform public.assert(v_next = current_date + 7,
    format('weekly вчасно -> рівно через 7 днів (маємо %s)', v_next));

  -- Завдання зі строком у майбутньому теж закривають достроково.
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Тижневе наперед', current_date + 3, 'weekly')
  returning id into v_task;
  v_new := public.complete_task(v_task);
  select due_on into v_next from public.tasks where id = v_new;
  perform public.assert(v_next = current_date + 10,
    format('weekly достроково -> 7 днів від власного строку (маємо %s)', v_next));
end $$;

do $$
declare v_task uuid; v_new uuid; v_next date; v_due date; i int; v_dow int;
begin
  -- Зсув 0..6 гарантує, що базою по черзі побуває кожен день тижня,
  -- і перевірка не залежить від того, коли її запустили.
  for i in 0..6 loop
    v_due := current_date + i;
    insert into public.tasks (user_id, title, due_on, repeat)
    values ('11111111-1111-1111-1111-111111111111', format('Будні +%s', i), v_due, 'weekdays')
    returning id into v_task;

    v_new := public.complete_task(v_task);
    select due_on into v_next from public.tasks where id = v_new;
    v_dow := extract(isodow from v_next);

    perform public.assert(v_dow between 1 and 5,
      format('weekdays з %s (isodow %s) не дає вихідний: %s (isodow %s)',
             v_due, extract(isodow from v_due), v_next, v_dow));
    perform public.assert(v_next > v_due and v_next - v_due <= 3,
      format('weekdays з %s дає найближчий робочий день (%s)', v_due, v_next));
  end loop;

  -- І те саме для давно простроченого: базою стає сьогодні.
  v_due := current_date - 30;
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Будні забуті', v_due, 'weekdays')
  returning id into v_task;
  v_new := public.complete_task(v_task);
  select due_on into v_next from public.tasks where id = v_new;
  v_dow := extract(isodow from v_next);
  perform public.assert(v_dow between 1 and 5,
    format('weekdays прострочене не дає вихідний (%s, isodow %s)', v_next, v_dow));
  perform public.assert(v_next > current_date,
    format('weekdays прострочене дає дату в майбутньому (%s)', v_next));
end $$;

do $$
declare v_task uuid; v_new uuid; v_arch timestamptz; v_children int;
begin
  insert into public.tasks (user_id, title, due_on, repeat)
  values ('11111111-1111-1111-1111-111111111111', 'Разове', current_date - 5, 'none')
  returning id into v_task;

  v_new := public.complete_task(v_task);
  select archived_at into v_arch from public.tasks where id = v_task;
  select count(*) into v_children from public.tasks where title = 'Разове';

  perform public.assert(v_new is null, 'разове завдання не породжує наступного');
  perform public.assert(v_arch is not null, 'разове завдання теж потрапляє в архів');
  perform public.assert(v_children = 1, 'після закриття разового завдання копій не з’явилось');
end $$;

reset role;
