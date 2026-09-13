-- Лише для одноразової тестової бази, не для живого SQL Editor.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.monthly_investments(user_id,month,amount_cents)
values ('11111111-1111-1111-1111-111111111111','2026-09-01',50000)
on conflict(user_id,month) do update set amount_cents=excluded.amount_cents;
insert into public.monthly_investments(user_id,month,amount_cents)
values ('11111111-1111-1111-1111-111111111111','2026-10-01',10000);
insert into public.monthly_investments(user_id,month,amount_cents)
values ('11111111-1111-1111-1111-111111111111','2026-09-01',60000)
on conflict(user_id,month) do update set amount_cents=excluded.amount_cents;
select public.assert((select amount_cents=60000 from public.monthly_investments where month='2026-09-01'),'інвестиції замінюють лише вибраний місяць');
select public.assert((select amount_cents=10000 from public.monthly_investments where month='2026-10-01'),'сусідній місяць інвестицій збережено');
select public.assert(exists(select 1 from public.transactions where financial_account is null),'давні операції не приписано до Онлайн');
select public.assert_denied(
  'insert into public.monthly_investments(user_id,month,amount_cents) values (''22222222-2222-2222-2222-222222222222'',''2026-09-01'',1)',
  'не можна записати інвестиції іншого користувача');
do $$
declare s uuid; tx uuid; rejected boolean:=false;
begin
  insert into public.subscriptions(user_id,name,amount_cents,recurrence,next_due_on,financial_account)
  values(auth.uid(),'Перевірка рахунку',1234,'once','2026-09-01','cash') returning id into s;
  tx:=public.pay_subscription(s,'2026-09-13',null);
  perform public.assert((select financial_account='cash' from public.transactions where id=tx),'оплата успадковує рахунок з налаштувань платежу');
  perform public.assert((select financial_account='cash' from public.subscription_payments where transaction_id=tx),'історія зберігає рахунок фактичної оплати');
  update public.subscriptions set financial_account='gewerbe' where id=s;
  perform public.assert((select financial_account='cash' from public.subscription_payments where transaction_id=tx),'редагування платежу не змінює рахунок минулої оплати');
  begin
    insert into public.transactions(user_id,kind,amount_cents,financial_account) values(auth.uid(),'expense',100,'investments');
  exception when check_violation then rejected:=true;
  end;
  perform public.assert(rejected,'інвестиції не є звичайним рахунком витрат');
  rejected:=false;
  begin
    insert into public.monthly_investments(user_id,month,amount_cents) values(auth.uid(),'2026-09-02',100);
  exception when check_violation then rejected:=true;
  end;
  perform public.assert(rejected,'підсумок інвестицій має ключ першого дня місяця');
end $$;
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.assert((select count(*)=0 from public.monthly_investments),'другий користувач не бачить чужі інвестиції');
insert into public.monthly_investments(user_id,month,amount_cents) values(auth.uid(),'2026-09-01',20000);
update public.monthly_investments set amount_cents=1 where user_id='11111111-1111-1111-1111-111111111111';
delete from public.monthly_investments where user_id='11111111-1111-1111-1111-111111111111';
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.assert((select count(*)=2 from public.monthly_investments),'оновлення й видалення чужих інвестицій нічого не змінює');
select public.assert((select amount_cents=60000 from public.monthly_investments where month='2026-09-01'),'чужий запис не перезаписав суму власника');
reset role;
