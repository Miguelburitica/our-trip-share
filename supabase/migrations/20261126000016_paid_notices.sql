-- "Ana anotó que pagaste Peaje": when someone records, changes or removes a payment in another
-- member's name (the driver's toll), that member gets a notice to check it. Same table as the R14
-- "Tu saldo cambió" notices; `reason` tells them apart and `paid_*` holds what they paid.
alter table public.balance_notices
  add column reason text not null default 'reopened' check (reason in ('reopened', 'paid')),
  add column paid_before bigint,
  add column paid_after bigint,
  add constraint balance_notices_paid_amounts check ((reason = 'paid') = (paid_before is not null and paid_after is not null));
