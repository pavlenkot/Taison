-- Оновлення перед публікацією погодженого дизайну Taison.
-- Виконати цілком у Supabase SQL Editor; повторний запуск безпечний.
-- Наявні операції та підписки не перепризначаються автоматично.
begin;

-- Старі записи лишаються без розділу: спосіб введення не визначає рахунок.
alter table public.transactions add column if not exists financial_account text
  check (financial_account in ('online', 'cash', 'gewerbe'));
alter table public.subscriptions add column if not exists financial_account text
  check (financial_account in ('online', 'cash', 'gewerbe'));
alter table public.subscription_payments add column if not exists financial_account text
  check (financial_account in ('online', 'cash', 'gewerbe'));
create index if not exists transactions_account_date_idx
  on public.transactions (user_id, financial_account, occurred_on desc);


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
  v_next date;
  v_day smallint;
  v_steps integer;
begin
  select * into s from public.subscriptions where id = p_subscription_id;
  if not found then
    raise exception 'Підписку не знайдено';
  end if;

  v_amount := coalesce(p_amount_cents, s.amount_cents);

  insert into public.transactions
    (user_id, kind, amount_cents, currency, category_id, merchant, note, occurred_on, source, financial_account)
  values
    (s.user_id, 'expense', v_amount, s.currency, s.category_id, s.name,
     'Оплата підписки', p_paid_on, 'subscription', s.financial_account)
  returning id into v_tx;

  insert into public.subscription_payments
    (user_id, subscription_id, due_on, paid_on, amount_cents, transaction_id, financial_account)
  values
    (s.user_id, s.id, s.next_due_on, p_paid_on, v_amount, v_tx, s.financial_account);

  if s.recurrence = 'once' then
    update public.subscriptions set active = false where id = s.id;
  else
    -- Крокуємо, поки не опинимося строго після дати оплати. Інакше
    -- прострочена підписка лишалася б простроченою: щоб наздогнати
    -- пропущений рік, її довелося б «оплатити» дванадцять разів, і
    -- кожне натискання створювало б зайву витрату в обліку.
    v_day := coalesce(s.billing_day, extract(day from s.next_due_on)::smallint);
    v_next := s.next_due_on;
    v_steps := 0;

    loop
      v_steps := v_steps + 1;
      exit when v_steps > 1200;  -- запобіжник від вічного циклу

      v_next := case s.recurrence
        when 'weekly'    then v_next + 7
        when 'monthly'   then public.add_months_keep_day(v_next, 1, v_day)
        when 'quarterly' then public.add_months_keep_day(v_next, 3, v_day)
        when 'yearly'    then public.add_months_keep_day(v_next, 12, v_day)
      end;

      exit when v_next > p_paid_on;
    end loop;

    update public.subscriptions set next_due_on = v_next where id = s.id;
  end if;

  return v_tx;
end $$;

-- ---------------------------------------------------------------------
-- Місячні інвестиції — ручна загальна сума, окремо від витрат і накопичень.
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists summary text;
create table if not exists public.monthly_investments (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.monthly_investments enable row level security;
drop policy if exists "own rows" on public.monthly_investments;
create policy "own rows" on public.monthly_investments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists touch_monthly_investments on public.monthly_investments;
create trigger touch_monthly_investments before update on public.monthly_investments
  for each row execute function public.touch_updated_at();

commit;
