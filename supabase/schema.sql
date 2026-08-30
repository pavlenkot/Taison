-- =====================================================================
--  Taison — особистий облік витрат, доходів, підписок, цілей і завдань
--  Виконати цілком у Supabase → SQL Editor → New query → Run.
--  Скрипт ідемпотентний: повторний запуск нічого не зламає.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Категорії
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  slug        text not null,
  icon        text,
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  sort        integer not null default 100,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, slug)
);

-- Для тих, хто вже виконував цю схему раніше
alter table public.categories add column if not exists hidden boolean not null default false;

-- ---------------------------------------------------------------------
-- Скани: чеки та документи
-- ---------------------------------------------------------------------
create table if not exists public.receipts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null default 'receipt' check (kind in ('receipt', 'document')),
  storage_path   text not null,                 -- шлях у бакеті "receipts"
  original_name  text,
  mime           text,
  byte_size      integer,
  icloud_path    text,                          -- заповнює Швидка команда iOS
  ai_provider    text,                          -- claude | gemini
  ai_model       text,
  ai_raw         jsonb,                         -- повна відповідь моделі, як є
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Операції: витрати й доходи
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('expense', 'income')),
  amount_cents  bigint not null check (amount_cents > 0),
  currency      text not null default 'EUR',
  category_id   uuid references public.categories (id) on delete set null,
  merchant      text,
  note          text,
  occurred_on   date not null default current_date,
  source        text not null default 'manual'
                check (source in ('manual', 'scan', 'shortcut', 'subscription')),
  receipt_id    uuid references public.receipts (id) on delete set null,
  needs_review  boolean not null default false, -- true, поки скан не підтверджено
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);
create index if not exists transactions_review_idx
  on public.transactions (user_id, needs_review) where needs_review;

-- ---------------------------------------------------------------------
-- Підписки та рахунки до сплати
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  amount_cents  bigint not null check (amount_cents > 0),
  currency      text not null default 'EUR',
  category_id   uuid references public.categories (id) on delete set null,
  recurrence    text not null default 'monthly'
                check (recurrence in ('once', 'weekly', 'monthly', 'quarterly', 'yearly')),
  next_due_on   date not null,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists subscriptions_due_idx
  on public.subscriptions (user_id, active, next_due_on);

-- Кожен факт оплати — рядок тут. Це і є архів платежів.
create table if not exists public.subscription_payments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  due_on           date not null,
  paid_on          date not null default current_date,
  amount_cents     bigint not null,
  transaction_id   uuid references public.transactions (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Цілі
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  target_cents  bigint check (target_cents is null or target_cents > 0),
  currency      text not null default 'EUR',
  due_on        date,
  notes         text,
  status        text not null default 'active' check (status in ('active', 'done', 'archived')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.goal_contributions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  goal_id       uuid not null references public.goals (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents <> 0),
  made_on       date not null default current_date,
  note          text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Щоденні завдання
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  note         text,
  due_on       date not null default current_date,
  repeat       text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly')),
  done_at      timestamptz,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists tasks_user_due_idx on public.tasks (user_id, due_on desc);
create index if not exists tasks_active_idx
  on public.tasks (user_id, archived_at) where archived_at is null;

-- ---------------------------------------------------------------------
-- Переглянуті підсумки за період
-- ---------------------------------------------------------------------
create table if not exists public.digest_views (
  user_id       uuid not null references auth.users (id) on delete cascade,
  period_kind   text not null check (period_kind in ('week', 'month')),
  period_start  date not null,
  seen_at       timestamptz not null default now(),
  primary key (user_id, period_kind, period_start)
);

-- ---------------------------------------------------------------------
-- Row Level Security: кожен бачить тільки своє
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'receipts', 'transactions', 'subscriptions',
    'subscription_payments', 'goals', 'goal_contributions', 'tasks',
    'digest_views'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I
         for all to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['transactions', 'subscriptions', 'goals'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Категорії за замовчуванням для нового користувача
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.categories (user_id, name, slug, icon, kind, sort)
  values
    (p_user, 'Продукти',            'groceries',   '🛒', 'expense', 10),
    (p_user, 'Кафе та ресторани',   'dining',      '🍽️', 'expense', 20),
    (p_user, 'Авто та паливо',      'auto',        '🚗', 'expense', 30),
    (p_user, 'Транспорт',           'transport',   '🚆', 'expense', 40),
    (p_user, 'Техніка',             'electronics', '💻', 'expense', 50),
    (p_user, 'Житло та комунальні', 'housing',     '🏠', 'expense', 60),
    (p_user, 'Здоров''я',           'health',      '💊', 'expense', 70),
    (p_user, 'Одяг',                'clothing',    '👕', 'expense', 80),
    (p_user, 'Розваги',             'fun',         '🎬', 'expense', 90),
    (p_user, 'Підписки',            'subs',        '🔁', 'expense', 100),
    (p_user, 'Подорожі',            'travel',      '✈️', 'expense', 110),
    (p_user, 'Освіта',              'education',   '📚', 'expense', 120),
    (p_user, 'Подарунки',           'gifts',       '🎁', 'expense', 130),
    (p_user, 'Інше',                'other',       '📦', 'expense', 900),
    (p_user, 'Зарплата',            'salary',      '💰', 'income',  10),
    (p_user, 'Фріланс',             'freelance',   '🧾', 'income',  20),
    (p_user, 'Продаж',              'sale',        '🏷️', 'income',  30),
    (p_user, 'Повернення',          'refund',      '↩️', 'income',  40),
    (p_user, 'Інвестиції',          'invest',      '📈', 'income',  50),
    (p_user, 'Інший дохід',         'other_income','📦', 'income',  900)
  on conflict (user_id, slug) do nothing;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_categories(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Аналітика: підсумки за період з групуванням по кошиках і категоріях.
-- p_bucket: 'day' | 'week' | 'month' | 'year'
-- ---------------------------------------------------------------------
create or replace function public.period_totals(
  p_from date,
  p_to date,
  p_bucket text default 'month'
)
returns table (
  bucket         date,
  kind           text,
  category_slug  text,
  category_name  text,
  total_cents    bigint,
  entries        bigint
)
language sql stable security invoker set search_path = public as $$
  select
    date_trunc(p_bucket, t.occurred_on)::date        as bucket,
    t.kind,
    coalesce(c.slug, 'uncategorised')                as category_slug,
    coalesce(c.name, 'Без категорії')                as category_name,
    sum(t.amount_cents)::bigint                      as total_cents,
    count(*)::bigint                                 as entries
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.needs_review = false
    and t.occurred_on >= p_from
    and t.occurred_on <= p_to
  group by 1, 2, 3, 4
  order by 1, 2, 5 desc;
$$;

-- ---------------------------------------------------------------------
-- Оплата підписки: створює витрату, пише в архів платежів,
-- пересуває наступну дату. Все однією транзакцією.
-- ---------------------------------------------------------------------
create or replace function public.pay_subscription(
  p_subscription_id uuid,
  p_paid_on date default current_date,
  p_amount_cents bigint default null
)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  s public.subscriptions%rowtype;
  v_amount bigint;
  v_tx uuid;
begin
  select * into s from public.subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Підписку не знайдено';
  end if;

  v_amount := coalesce(p_amount_cents, s.amount_cents);

  insert into public.transactions
    (user_id, kind, amount_cents, currency, category_id, merchant, note, occurred_on, source)
  values
    (s.user_id, 'expense', v_amount, s.currency, s.category_id, s.name,
     'Оплата підписки', p_paid_on, 'subscription')
  returning id into v_tx;

  insert into public.subscription_payments
    (user_id, subscription_id, due_on, paid_on, amount_cents, transaction_id)
  values
    (s.user_id, s.id, s.next_due_on, p_paid_on, v_amount, v_tx);

  if s.recurrence = 'once' then
    update public.subscriptions set active = false where id = s.id;
  else
    update public.subscriptions
      set next_due_on = s.next_due_on + case s.recurrence
            when 'weekly'    then interval '1 week'
            when 'monthly'   then interval '1 month'
            when 'quarterly' then interval '3 months'
            when 'yearly'    then interval '1 year'
          end
      where id = s.id;
  end if;

  return v_tx;
end $$;

-- ---------------------------------------------------------------------
-- Завершення завдання: в архів, і, якщо воно повторюване,
-- створити наступний примірник.
-- ---------------------------------------------------------------------
create or replace function public.complete_task(p_task_id uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t public.tasks%rowtype;
  v_next date;
  v_new uuid := null;
begin
  select * into t from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Завдання не знайдено';
  end if;

  update public.tasks
    set done_at = now(), archived_at = now()
    where id = t.id;

  if t.repeat <> 'none' then
    v_next := case t.repeat
      when 'daily'  then t.due_on + 1
      when 'weekly' then t.due_on + 7
      when 'weekdays' then
        case extract(isodow from t.due_on)
          when 5 then t.due_on + 3   -- п'ятниця -> понеділок
          when 6 then t.due_on + 2   -- субота  -> понеділок
          else t.due_on + 1
        end
    end;

    insert into public.tasks (user_id, title, note, due_on, repeat)
    values (t.user_id, t.title, t.note, v_next, t.repeat)
    returning id into v_new;
  end if;

  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- Сховище файлів: приватний бакет, кожен файл лежить у теці <user_id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "own files read"   on storage.objects;
drop policy if exists "own files write"  on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;

create policy "own files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files update" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
--  Документи: розібрані сканом папери з метаданими та пошуком
-- =====================================================================

-- array_to_string у Postgres позначена як STABLE, бо в загальному випадку
-- залежить від функції виводу типу елемента. Для масиву text це насправді
-- незмінне перетворення, тож загортаємо його у власну immutable-функцію —
-- інакше генеровану колонку пошуку створити не можна.
create or replace function public.text_array_to_string(arr text[])
returns text language sql immutable parallel safe as $$
  select array_to_string(coalesce(arr, '{}'::text[]), ' ');
$$;

create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Сам файл лежить у receipts; тут — те, що з нього вичитала модель.
  receipt_id        uuid references public.receipts (id) on delete cascade,
  doc_type          text not null default 'other' check (doc_type in (
                      'government', 'tax', 'insurance', 'employment', 'housing',
                      'banking', 'medical', 'education', 'vehicle', 'contract',
                      'warranty', 'personal', 'other')),
  -- Від кого документ: Finanzamt, Jobcenter, AOK, орендодавець…
  issuer            text,
  -- Те саме у вигляді імені теки: finanzamt, jobcenter
  issuer_slug       text,
  subject           text,
  -- Aktenzeichen, Steuernummer, номер договору — за ним і шукають найчастіше
  reference_number  text,
  document_date     date,
  -- Frist: строк, до якого треба відповісти або заплатити
  deadline          date,
  amount_cents      bigint,
  keywords          text[] not null default '{}',
  -- Повний текст зі скану — заради нього пошук і працює
  body_text         text,
  language          text,
  -- Куди Швидка команда поклала файл в iCloud Drive
  icloud_path       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Пошуковий вектор. Конфігурація 'simple': без стемінгу, бо документи
-- змішані — німецькі, українські та англійські, і жодна мовна
-- конфігурація не підійшла б усім трьом.
alter table public.documents
  add column if not exists search tsvector
  generated always as (
    to_tsvector('simple'::regconfig,
      coalesce(issuer, '') || ' ' ||
      coalesce(subject, '') || ' ' ||
      coalesce(reference_number, '') || ' ' ||
      public.text_array_to_string(keywords) || ' ' ||
      coalesce(body_text, '')
    )
  ) stored;

create index if not exists documents_search_idx on public.documents using gin (search);
create index if not exists documents_user_date_idx
  on public.documents (user_id, document_date desc nulls last);
create index if not exists documents_issuer_idx on public.documents (user_id, issuer_slug);
create index if not exists documents_deadline_idx
  on public.documents (user_id, deadline) where deadline is not null;

alter table public.documents enable row level security;
drop policy if exists "own rows" on public.documents;
create policy "own rows" on public.documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists touch_documents on public.documents;
create trigger touch_documents before update on public.documents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Пошук по документах.
-- Повнотекстовий запит дає влучні збіги за словами, а ilike добирає
-- частковий збіг: німецькі складені слова й уривки номерів справи
-- інакше не знайшлися б.
-- ---------------------------------------------------------------------
create or replace function public.search_documents(p_query text)
returns table (
  id                uuid,
  receipt_id        uuid,
  doc_type          text,
  issuer            text,
  issuer_slug       text,
  subject           text,
  reference_number  text,
  document_date     date,
  deadline          date,
  amount_cents      bigint,
  keywords          text[],
  language          text,
  icloud_path       text,
  created_at        timestamptz
)
language sql stable security invoker set search_path = public as $$
  select
    d.id, d.receipt_id, d.doc_type, d.issuer, d.issuer_slug, d.subject,
    d.reference_number, d.document_date, d.deadline, d.amount_cents,
    d.keywords, d.language, d.icloud_path, d.created_at
  from public.documents d
  where d.user_id = auth.uid()
    and (
      p_query is null
      or btrim(p_query) = ''
      or d.search @@ websearch_to_tsquery('simple', p_query)
      or d.issuer ilike '%' || p_query || '%'
      or d.subject ilike '%' || p_query || '%'
      or d.reference_number ilike '%' || p_query || '%'
      or d.body_text ilike '%' || p_query || '%'
    )
  order by
    ts_rank(
      d.search,
      websearch_to_tsquery('simple', coalesce(nullif(btrim(p_query), ''), 'zzzz'))
    ) desc,
    d.document_date desc nulls last,
    d.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- Теки адресатів: те, що показуємо як «папки» і що Швидка команда
-- створює в iCloud Drive.
-- ---------------------------------------------------------------------
create or replace function public.document_folders()
returns table (
  issuer_slug   text,
  issuer        text,
  documents     bigint,
  last_document date
)
language sql stable security invoker set search_path = public as $$
  -- Слаг '_none' — теки без адресата. Підкреслення на початку slugify()
  -- ніколи не поверне, тож зіткнутися зі справжнім адресатом не може.
  -- Групуємо лише за слагом: різні написання однієї установи («Finanzamt»
  -- і «FINANZAMT») дають один слаг і мають бути однією текою.
  select
    coalesce(d.issuer_slug, '_none')                    as issuer_slug,
    coalesce(max(nullif(d.issuer, '')), 'Без адресата') as issuer,
    count(*)::bigint                                    as documents,
    max(d.document_date)                                as last_document
  from public.documents d
  where d.user_id = auth.uid()
  group by 1
  order by 3 desc, 2;
$$;
