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
do $do$ begin perform public.assert_denied(
  $q$select public.seed_default_categories('22222222-2222-2222-2222-222222222222')$q$,
  'виклик seed_default_categories під authenticated відхилено'); end $do$;
do $do$ begin perform public.assert_denied(
  $q$select public.handle_new_user()$q$,
  'виклик handle_new_user під authenticated відхилено'); end $do$;
reset role;

set role anon;
do $do$ begin perform public.assert_denied(
  $q$select public.seed_default_categories('22222222-2222-2222-2222-222222222222')$q$,
  'виклик seed_default_categories під anon відхилено'); end $do$;
do $do$ begin perform public.assert_denied(
  $q$select public.handle_new_user()$q$,
  'виклик handle_new_user під anon відхилено'); end $do$;
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
do $do$ begin perform public.assert_denied(
  $q$insert into public.transactions (user_id, kind, amount_cents)
     values ('22222222-2222-2222-2222-222222222222', 'expense', 100)$q$,
  'insert у transactions з чужим user_id відхилено'); end $do$;
do $do$ begin perform public.assert_denied(
  $q$insert into public.documents (user_id, subject)
     values ('22222222-2222-2222-2222-222222222222', 'підкинутий')$q$,
  'insert у documents з чужим user_id відхилено'); end $do$;
do $do$ begin perform public.assert_denied(
  $q$insert into public.categories (user_id, name, slug)
     values ('22222222-2222-2222-2222-222222222222', 'Чуже', 'foreign')$q$,
  'insert у categories з чужим user_id відхилено'); end $do$;

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

do $do$ begin perform public.assert_denied(
  $q$insert into public.google_credentials (user_id, refresh_token_enc)
     values ('11111111-1111-1111-1111-111111111111', 'enc:підміна')$q$,
  'insert у google_credentials відхилено навіть для власного user_id'); end $do$;

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

\echo ''
\echo '--- 7. pay_subscription: витрата, архів платежу, наступна дата ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare
  v_cat uuid; v_sub uuid; v_tx uuid;
  t public.transactions%rowtype;
  p public.subscription_payments%rowtype;
  v_next date; v_active boolean;
begin
  select id into v_cat from public.categories
   where user_id = '11111111-1111-1111-1111-111111111111' and slug = 'subs';

  insert into public.subscriptions (user_id, name, amount_cents, currency, category_id, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Netflix', 1799, 'EUR', v_cat, 'monthly', '2025-03-15')
  returning id into v_sub;

  v_tx := public.pay_subscription(v_sub, '2025-03-14');

  select * into t from public.transactions where id = v_tx;
  perform public.assert(t.id is not null, 'оплата підписки повертає id створеної операції');
  perform public.assert(t.kind = 'expense', 'оплата підписки створює саме витрату');
  perform public.assert(t.amount_cents = 1799, format('сума операції дорівнює сумі підписки (маємо %s)', t.amount_cents));
  perform public.assert(t.currency = 'EUR', 'валюта операції взята з підписки');
  perform public.assert(t.category_id = v_cat, 'категорія операції взята з підписки');
  perform public.assert(t.merchant = 'Netflix', 'назва підписки лягає в merchant');
  perform public.assert(t.occurred_on = date '2025-03-14', 'дата операції — день оплати, а не строк');
  -- Джерело 'subscription' відрізняє автоматичні витрати від ручних:
  -- без нього оплати неможливо відрізнити від того, що людина ввела сама.
  perform public.assert(t.source = 'subscription', 'джерело операції — subscription');

  select * into p from public.subscription_payments where subscription_id = v_sub;
  perform public.assert(p.id is not null, 'платіж потрапив в архів subscription_payments');
  perform public.assert(p.due_on = date '2025-03-15', 'в архіві збережено строк, який був на момент оплати');
  perform public.assert(p.paid_on = date '2025-03-14', 'в архіві збережено день оплати');
  perform public.assert(p.amount_cents = 1799, 'в архіві збережено суму');
  perform public.assert(p.transaction_id = v_tx, 'архівний платіж посилається на створену операцію');

  select next_due_on, active into v_next, v_active from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2025-04-15', format('monthly зсуває строк на місяць (маємо %s)', v_next));
  perform public.assert(v_active, 'підписка лишається активною');
end $$;

do $$
declare v_sub uuid; v_next date; v_active boolean; v_tx uuid;
begin
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Домен', 1200, 'yearly', '2025-03-15')
  returning id into v_sub;
  v_tx := public.pay_subscription(v_sub, '2025-03-15');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2026-03-15', format('yearly зсуває строк на рік (маємо %s)', v_next));

  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Страхування', 9000, 'quarterly', '2025-03-15')
  returning id into v_sub;
  v_tx := public.pay_subscription(v_sub, '2025-03-15');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2025-06-15', format('quarterly зсуває строк на 3 місяці (маємо %s)', v_next));

  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Спортзал', 2500, 'weekly', '2025-03-15')
  returning id into v_sub;
  v_tx := public.pay_subscription(v_sub, '2025-03-15');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2025-03-22', format('weekly зсуває строк на тиждень (маємо %s)', v_next));

  -- Разовий рахунок не має наступного строку: його просто знімають
  -- зі списку, інакше він щомісяця повертався б у «до сплати».
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Рахунок за світло', 14300, 'once', '2025-03-15')
  returning id into v_sub;
  v_tx := public.pay_subscription(v_sub, '2025-03-15');
  select next_due_on, active into v_next, v_active from public.subscriptions where id = v_sub;
  perform public.assert(v_active = false, 'once після оплати стає неактивною');
  perform public.assert(v_next = date '2025-03-15', 'once не зсуває строк');
end $$;

do $$
declare v_sub uuid; v_tx uuid; v_amount bigint; v_sub_amount bigint;
begin
  -- Рахунок прийшов на іншу суму, ніж записано в підписці: платимо
  -- фактичну, а сама підписка лишається з попередньою.
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values ('11111111-1111-1111-1111-111111111111', 'Комуналка', 8000, 'monthly', '2025-05-01')
  returning id into v_sub;
  v_tx := public.pay_subscription(v_sub, '2025-05-01', 9350);

  select amount_cents into v_amount from public.transactions where id = v_tx;
  select amount_cents into v_sub_amount from public.subscriptions where id = v_sub;
  perform public.assert(v_amount = 9350, format('явна сума перекриває суму підписки (маємо %s)', v_amount));
  perform public.assert(v_sub_amount = 8000, 'сама підписка при цьому не змінюється');
end $$;

reset role;

\echo ''
\echo '--- 8. search_documents ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare v_ids uuid[]; v_cnt int;
begin
  select array_agg(id) into v_ids from public.search_documents('Zahlung');
  perform public.assert(v_ids = array['d0c00001-0000-0000-0000-000000000001'::uuid],
    format('слово з body_text знаходить свій документ і лише його (маємо %s)', v_ids));

  select array_agg(id) into v_ids from public.search_documents('Mahnung');
  perform public.assert(v_ids = array['d0c00002-0000-0000-0000-000000000002'::uuid],
    'слово з subject знаходить документ');

  -- Уривок номера справи: повнотекстовий індекс його не бачить, бо
  -- 'AZ-2025/4471-B' розбирається на цілі токени. Знаходить лише ilike,
  -- тому в search_documents і є друга гілка.
  perform public.assert(
    not (to_tsvector('simple', 'AZ-2025/4471-B') @@ websearch_to_tsquery('simple', '4471')),
    'повнотекстовий пошук справді не знаходить уривок номера — гілка ilike не зайва');

  select array_agg(id) into v_ids from public.search_documents('4471');
  perform public.assert(v_ids = array['d0c00001-0000-0000-0000-000000000001'::uuid],
    format('уривок reference_number знаходить документ (маємо %s)', v_ids));

  -- keywords не входить у жодну ilike-гілку, отже це перевіряє саме
  -- повнотекстовий вектор і те, що кирилиця в ньому токенізується.
  select array_agg(id) into v_ids from public.search_documents('податкова');
  perform public.assert(v_ids = array['d0c00001-0000-0000-0000-000000000001'::uuid],
    format('українське ключове слово знаходить документ (маємо %s)', v_ids));

  select count(*) into v_cnt from public.search_documents('');
  perform public.assert(v_cnt = 4, format('порожній запит віддає всі свої документи (маємо %s)', v_cnt));

  select count(*) into v_cnt from public.search_documents('Kindergeld');
  perform public.assert(v_cnt = 0, 'запит без збігів нічого не вигадує');
end $$;

reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

-- У Б лежить документ із тим самим номером, тим самим словом у тексті
-- і тим самим ключовим словом. Якби пошук не спирався на auth.uid(),
-- сюди потрапили б чужі папери.
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.search_documents('4471');
  perform public.assert(v_ids = array['d0c000b1-0000-0000-0000-0000000000b1'::uuid],
    format('пошук по номеру не віддає чужий документ (маємо %s)', v_ids));

  select array_agg(id) into v_ids from public.search_documents('Zahlung');
  perform public.assert(v_ids = array['d0c000b1-0000-0000-0000-0000000000b1'::uuid],
    'пошук по слову з тексту не віддає чужий документ');

  select array_agg(id) into v_ids from public.search_documents('податкова');
  perform public.assert(v_ids = array['d0c000b1-0000-0000-0000-0000000000b1'::uuid],
    'пошук по ключовому слову не віддає чужий документ');
end $$;

reset role;

\echo ''
\echo '--- 9. document_folders ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare v_rows int; v_distinct int; v_docs bigint; v_issuer text; v_last date;
begin
  select count(*), count(distinct issuer_slug) into v_rows, v_distinct from public.document_folders();
  perform public.assert(v_rows = 3, format('у А три теки: finanzamt, jobcenter, _none (маємо %s)', v_rows));
  -- Теки — це ще й імена каталогів в iCloud Drive: два рядки з однаковим
  -- слагом означали б дві теки з одним іменем.
  perform public.assert(v_rows = v_distinct, 'кожен слаг трапляється в переліку рівно раз');

  select documents, issuer, last_document into v_docs, v_issuer, v_last
    from public.document_folders() where issuer_slug = 'finanzamt';
  perform public.assert(v_docs = 2,
    format('«Finanzamt» і «FINANZAMT» злилися в одну теку з двома документами (маємо %s)', v_docs));
  perform public.assert(v_issuer is not null and v_issuer <> 'Без адресата',
    'тека з адресатом показує одне з його написань');
  perform public.assert(v_last = date '2025-03-01', 'у теці видно дату найсвіжішого документа');

  select documents, issuer into v_docs, v_issuer
    from public.document_folders() where issuer_slug = '_none';
  perform public.assert(v_docs = 1, format('документи без адресата зібрані під _none (маємо %s)', v_docs));
  perform public.assert(v_issuer = 'Без адресата', 'тека _none підписана зрозуміло для людини');

  select documents into v_docs from public.document_folders() where issuer_slug = 'jobcenter';
  perform public.assert(v_docs = 1, 'окремий адресат лишається окремою текою');
end $$;

reset role;

\echo ''
\echo '--- 10. period_totals ---'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare v_rows int; v_sum bigint; v_total bigint; v_entries bigint; v_name text;
begin
  select count(*), coalesce(sum(total_cents), 0) into v_rows, v_sum
    from public.period_totals('2024-03-01', '2024-03-31', 'month');
  perform public.assert(v_rows = 4, format('березень дає 4 рядки підсумків (маємо %s)', v_rows));
  -- Сума зійдеться тільки якщо одночасно відкинуто непідтверджений скан,
  -- квітневу витрату і витрату іншого користувача за той самий день.
  perform public.assert(v_sum = 308500, format('сума за березень 308500 (маємо %s)', v_sum));

  select total_cents, entries into v_total, v_entries
    from public.period_totals('2024-03-01', '2024-03-31', 'month')
   where kind = 'expense' and category_slug = 'groceries';
  perform public.assert(v_total = 3500 and v_entries = 2,
    format('продукти: 3500 за 2 операції (маємо %s за %s)', v_total, v_entries));
  perform public.assert(
    not exists (select 1 from public.period_totals('2024-03-01', '2024-03-31', 'month')
                 where total_cents = 9999),
    'операція з needs_review не потрапляє в підсумки');

  select total_cents, category_name into v_total, v_name
    from public.period_totals('2024-03-01', '2024-03-31', 'month')
   where category_slug = 'uncategorised';
  perform public.assert(v_total = 4300, format('витрата без категорії не губиться (маємо %s)', v_total));
  perform public.assert(v_name = 'Без категорії', 'витрата без категорії підписана зрозуміло');

  select total_cents into v_total
    from public.period_totals('2024-03-01', '2024-03-31', 'month')
   where kind = 'income' and category_slug = 'salary';
  perform public.assert(v_total = 300000, 'доходи рахуються окремо від витрат');

  perform public.assert(
    (select bool_and(bucket = date '2024-03-01')
       from public.period_totals('2024-03-01', '2024-03-31', 'month')),
    'при кошику month усе зводиться до першого числа місяця');

  -- Кошик має справді впливати на групування, а не бути прикрасою.
  select count(*) into v_rows
    from public.period_totals('2024-03-01', '2024-03-31', 'day')
   where category_slug = 'groceries';
  perform public.assert(v_rows = 2,
    format('при кошику day ті самі продукти розпадаються на 2 дні (маємо %s)', v_rows));

  select coalesce(sum(total_cents), 0) into v_sum
    from public.period_totals('2024-03-06', '2024-03-07', 'month');
  perform public.assert(v_sum = 3200, format('межі діапазону включні (маємо %s, чекали 3200)', v_sum));
end $$;

reset role;

-- =====================================================================
\echo '--- 11. Оплата простроченої підписки й межа місяця ---'
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_sub uuid; v_next date; v_day smallint;
  v_tx_count integer; v_pay_count integer;
begin
  -- Підписка, яку забули відмічати понад рік.
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values (v_user, 'Прострочена', 1000, 'monthly', current_date - interval '19 months')
  returning id into v_sub;

  perform public.pay_subscription(v_sub, current_date);

  select next_due_on into v_next from public.subscriptions where id = v_sub;
  -- Без переносу наступний строк лишився б у минулому, і підписку
  -- довелося б «оплатити» ще вісімнадцять разів, щоб вона наздогнала
  -- сьогодні. Кожне натискання створювало б зайву витрату в обліку.
  perform public.assert(v_next > current_date,
    format('одна оплата виводить прострочену підписку в майбутнє (маємо %s)', v_next));

  select count(*) into v_tx_count from public.transactions
   where user_id = v_user and merchant = 'Прострочена';
  select count(*) into v_pay_count from public.subscription_payments
   where subscription_id = v_sub;

  perform public.assert(v_tx_count = 1,
    format('одна оплата створює рівно одну витрату (маємо %s)', v_tx_count));
  perform public.assert(v_pay_count = 1,
    format('одна оплата створює рівно один запис в архіві (маємо %s)', v_pay_count));

  -- День списання лишається якорем і не з'їжджає разом із датою.
  select billing_day into v_day from public.subscriptions where id = v_sub;
  perform public.assert(v_day = extract(day from current_date - interval '19 months')::smallint,
    format('день списання не змінився після оплати (маємо %s)', v_day));
end $$;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_sub uuid; v_next date;
begin
  -- Рахунок 31-го числа: лютий коротший, але це не привід з'їжджати назавжди.
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values (v_user, 'Оренда 31', 50000, 'monthly', '2025-01-31')
  returning id into v_sub;

  perform public.pay_subscription(v_sub, '2025-01-31');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2025-02-28',
    format('31 січня переходить у 28 лютого (маємо %s)', v_next));

  perform public.pay_subscription(v_sub, '2025-02-28');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  -- Найважливіше: з лютого повертаємось на 31-ше, а не лишаємось на 28-му.
  perform public.assert(v_next = date '2025-03-31',
    format('після лютого повертається на 31-ше, а не застрягає на 28-му (маємо %s)', v_next));

  perform public.pay_subscription(v_sub, '2025-03-31');
  select next_due_on into v_next from public.subscriptions where id = v_sub;
  perform public.assert(v_next = date '2025-04-30',
    format('квітень має 30 днів (маємо %s)', v_next));
end $$;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_sub uuid; v_day smallint;
begin
  insert into public.subscriptions (user_id, name, amount_cents, recurrence, next_due_on)
  values (v_user, 'Якір дня', 100, 'monthly', '2025-06-17')
  returning id into v_sub;

  select billing_day into v_day from public.subscriptions where id = v_sub;
  perform public.assert(v_day = 17,
    format('день списання виставляється сам під час вставки (маємо %s)', v_day));
end $$;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_task uuid; v_first uuid; v_second uuid; v_count integer;
begin
  insert into public.tasks (user_id, title, due_on, repeat)
  values (v_user, 'Подвійне натискання', current_date, 'daily')
  returning id into v_task;

  v_first := public.complete_task(v_task);
  v_second := public.complete_task(v_task);

  perform public.assert(v_first is not null, 'перше завершення створює наступний примірник');
  -- Повторний виклик приходить від подвійного натискання, а не від наміру
  -- завершити завдання вдруге: другий примірник був би сміттям у списку.
  perform public.assert(v_second is null, 'повторне завершення не створює другий примірник');

  select count(*) into v_count from public.tasks
   where user_id = v_user and title = 'Подвійне натискання';
  perform public.assert(v_count = 2,
    format('після двох натискань лишається два рядки: завершений і наступний (маємо %s)', v_count));
end $$;

reset role;

-- =====================================================================
\echo '--- 12. Друга копія на Диску: стан і зведення ---'
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare
  v_user uuid := '11111111-1111-1111-1111-111111111111';
  v_status text;
  v_attempts smallint;
  v_before record;
  v_after record;
begin
  -- Рахуємо приріст, а не абсолютні числа: у базі вже є дані з інших
  -- розділів, і жорсткі очікування ламалися б від будь-якої правки вище.
  select * into v_before from public.drive_sync_summary();

  insert into public.receipts (user_id, kind, storage_path, byte_size)
  values (v_user, 'receipt', v_user || '/new.pdf', 1000)
  returning drive_sync_status, drive_attempts into v_status, v_attempts;

  -- Новий скан ще нікуди не поїхав: поки він лише в застосунку.
  perform public.assert(v_status = 'pending',
    format('новий скан починає життя зі станом pending (маємо %s)', v_status));
  perform public.assert(v_attempts = 0,
    format('лічильник спроб починається з нуля (маємо %s)', v_attempts));

  insert into public.receipts (user_id, kind, storage_path, byte_size, drive_sync_status)
  values
    (v_user, 'receipt', v_user || '/a.pdf', 2000, 'synced'),
    (v_user, 'receipt', v_user || '/b.pdf', 3000, 'failed'),
    (v_user, 'document', v_user || '/c.pdf', 4000, 'skipped');

  select * into v_after from public.drive_sync_summary();

  perform public.assert(v_after.synced - v_before.synced = 1,
    format('зведення рахує синхронізовані (приріст %s)', v_after.synced - v_before.synced));
  perform public.assert(v_after.pending - v_before.pending = 1,
    format('зведення рахує ті, що чекають (приріст %s)', v_after.pending - v_before.pending));
  perform public.assert(v_after.failed - v_before.failed = 1,
    format('зведення рахує невдалі (приріст %s)', v_after.failed - v_before.failed));
  -- skipped — це не помилка, а «Диск не підключено», і рахується окремо:
  -- інакше людину лякало б попередження там, де вона нічого не обіцяла.
  perform public.assert(v_after.skipped - v_before.skipped = 1,
    format('зведення рахує пропущені окремо (приріст %s)', v_after.skipped - v_before.skipped));
  perform public.assert(v_after.stored_bytes - v_before.stored_bytes = 10000,
    format('зведення додає розміри файлів (приріст %s)', v_after.stored_bytes - v_before.stored_bytes));
end $$;

do $$
declare v_mine bigint; v_total bigint;
begin
  select synced + pending + failed + skipped into v_mine from public.drive_sync_summary();
  -- Зведення бачить лише свої файли: RLS тут не єдиний захист, у функції
  -- стоїть явний фільтр за auth.uid().
  select count(*) into v_total from public.receipts
   where user_id = '11111111-1111-1111-1111-111111111111';
  perform public.assert(v_mine = v_total,
    format('зведення рахує рівно свої файли (маємо %s із %s)', v_mine, v_total));
end $$;

do $$
declare v_code text;
begin
  -- Тут чекаємо саме порушення обмеження (23514), а не відмови в правах:
  -- assert_denied перевіряє інший код і сказав би, що тест не пройшов,
  -- хоча база повелася правильно.
  begin
    insert into public.receipts (user_id, kind, storage_path, drive_sync_status)
    values ('11111111-1111-1111-1111-111111111111', 'receipt', 'x/y.pdf', 'вигаданий');
    perform public.assert(false, 'вигаданий стан синхронізації мав бути відхилений');
  exception when check_violation then
    get stacked diagnostics v_code = returned_sqlstate;
    perform public.assert(v_code = '23514',
      format('вигаданий стан синхронізації відхиляється обмеженням (код %s)', v_code));
  end;
end $$;

reset role;

-- =====================================================================
\echo '--- 13. Підписки на сповіщення ---'
-- =====================================================================

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare
  v_a uuid := '11111111-1111-1111-1111-111111111111';
  v_mine integer; v_failures smallint;
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_a, 'https://push.example/a-phone', 'key-a', 'auth-a')
  returning failures into v_failures;

  perform public.assert(v_failures = 0,
    format('лічильник відмов починається з нуля (маємо %s)', v_failures));

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_a, 'https://push.example/a-laptop', 'key-b', 'auth-b');

  select count(*) into v_mine from public.push_subscriptions;
  perform public.assert(v_mine = 2,
    format('два пристрої одного користувача живуть поруч (маємо %s)', v_mine));
end $$;

-- Повторна підписка з того самого пристрою має оновити запис, а не
-- створити другий: інакше одне нагадування прийшло б двічі.
do $$
declare v_count integer; v_key text;
begin
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/a-phone', 'key-new', 'auth-new')
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, failures = 0;

  select count(*) into v_count from public.push_subscriptions
   where endpoint = 'https://push.example/a-phone';
  select p256dh into v_key from public.push_subscriptions
   where endpoint = 'https://push.example/a-phone';

  perform public.assert(v_count = 1,
    format('повторна підписка не плодить дублів (маємо %s)', v_count));
  perform public.assert(v_key = 'key-new', 'повторна підписка оновлює ключі');
end $$;

select public.assert_denied(
  format($sql$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
               values (%L, 'https://push.example/stolen', 'k', 'a')$sql$,
         '22222222-2222-2222-2222-222222222222'),
  'підписка з чужим user_id відхиляється');

do $$
declare v_seen integer;
begin
  -- Чужі підписки не мають бути видні: у них ключі, якими можна
  -- надсилати сповіщення на чужий пристрій.
  set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_seen from public.push_subscriptions;
  perform public.assert(v_seen = 0,
    format('чужих підписок не видно (маємо %s)', v_seen));
end $$;

reset role;
