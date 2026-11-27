-- Peso dominicano (DOP) as a trip and expense currency. The allowed list mirrors
-- src/shared-kernel/money/currency.ts.
alter table public.trips drop constraint trips_base_currency_check,
  add constraint trips_base_currency_check check (base_currency in ('COP','USD','EUR','MXN','BRL','PEN','DOP','JPY','KWD'));
alter table public.expenses drop constraint expenses_currency_check,
  add constraint expenses_currency_check check (currency in ('COP','USD','EUR','MXN','BRL','PEN','DOP','JPY','KWD'));
alter table public.settlements drop constraint settlements_currency_check,
  add constraint settlements_currency_check check (currency in ('COP','USD','EUR','MXN','BRL','PEN','DOP','JPY','KWD'));
