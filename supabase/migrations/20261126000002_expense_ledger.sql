-- Bounded context: expense-ledger (openspec/changes/add-expense-ledger)

create type public.expense_type as enum ('expense', 'money_received');
create type public.expense_status as enum ('draft', 'complete', 'deleted');
create type public.split_method as enum ('equal', 'exact');

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  type          public.expense_type not null default 'expense',
  status        public.expense_status not null,
  category      text not null default 'otro'
                check (category in ('comida','transporte','super','tragos','alojamiento','planes','otro')),
  title         text check (title is null or length(title) <= 80),
  notes         text check (notes is null or length(notes) <= 500),
  occurred_at   timestamptz not null,
  currency      text check (currency in ('COP','USD','EUR','MXN','BRL','PEN','JPY','KWD')),
  amount        bigint check (amount > 0),
  fx_rate       numeric(30, 12) check (fx_rate > 0),
  fx_source     text check (fx_source in ('same_currency','api','manual','card_charge')),
  base_amount   bigint,
  split_method  public.split_method,
  money_version integer not null default 0 check (money_version >= 0),
  receipt_paths text[] not null default '{}',
  created_by    uuid not null references public.seats (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status = 'draft' or (currency is not null and amount is not null and split_method is not null)),
  check (status <> 'draft' or cardinality(receipt_paths) > 0)
);
create index expenses_trip_time on public.expenses (trip_id, occurred_at);

create table public.expense_payers (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  seat_id     uuid not null references public.seats (id),
  amount      bigint not null check (amount > 0),
  base_amount bigint,
  primary key (expense_id, seat_id)
);

create table public.expense_shares (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  seat_id     uuid not null references public.seats (id),
  amount      bigint not null check (amount >= 0),
  base_amount bigint,
  primary key (expense_id, seat_id)
);

create table public.expense_changes (
  id            bigserial primary key,
  expense_id    uuid not null references public.expenses (id) on delete cascade,
  at            timestamptz not null default now(),
  by_seat       uuid not null references public.seats (id),
  kind          text not null check (kind in ('created','drafted','completed','money_changed','details_changed','deleted')),
  money_version integer not null
);

-- ---------- money invariants, checked at commit (R4, R5, R6, R15) ----------

create function public.check_expense_sums(p_expense uuid) returns void
language plpgsql as $$
declare
  e public.expenses;
  pay_sum bigint; pay_base bigint; pay_nulls int;
  sh_sum bigint;  sh_base bigint;  sh_nulls int;
begin
  select * into e from public.expenses where id = p_expense;
  if e.id is null or e.status = 'draft' then return; end if;
  select coalesce(sum(amount),0), coalesce(sum(base_amount),0), count(*) filter (where base_amount is null)
    into pay_sum, pay_base, pay_nulls from public.expense_payers where expense_id = p_expense;
  select coalesce(sum(amount),0), coalesce(sum(base_amount),0), count(*) filter (where base_amount is null)
    into sh_sum, sh_base, sh_nulls from public.expense_shares where expense_id = p_expense;
  if pay_sum <> e.amount then
    raise exception 'expense %: payers sum % <> amount %', p_expense, pay_sum, e.amount using errcode = '23514';
  end if;
  if sh_sum <> e.amount then
    raise exception 'expense %: shares sum % <> amount %', p_expense, sh_sum, e.amount using errcode = '23514';
  end if;
  if e.base_amount is not null and (pay_nulls > 0 or sh_nulls > 0 or pay_base <> e.base_amount or sh_base <> e.base_amount) then
    raise exception 'expense %: base amounts do not sum to %', p_expense, e.base_amount using errcode = '23514';
  end if;
end;
$$;

create function public.trg_check_expense_sums() returns trigger
language plpgsql as $$
begin
  -- Separate branches: PL/pgSQL resolves every NEW field referenced in one expression.
  if tg_table_name = 'expenses' then
    perform public.check_expense_sums(new.id);
  elsif tg_op = 'DELETE' then
    perform public.check_expense_sums(old.expense_id);
  else
    perform public.check_expense_sums(new.expense_id);
  end if;
  return null;
end;
$$;

create constraint trigger expenses_sums after insert or update on public.expenses
  deferrable initially deferred for each row execute function public.trg_check_expense_sums();
create constraint trigger expense_payers_sums after insert or update or delete on public.expense_payers
  deferrable initially deferred for each row execute function public.trg_check_expense_sums();
create constraint trigger expense_shares_sums after insert or update or delete on public.expense_shares
  deferrable initially deferred for each row execute function public.trg_check_expense_sums();

-- ---------- RLS ----------

alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_shares enable row level security;
alter table public.expense_changes enable row level security;

create policy expenses_rw on public.expenses for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create policy expense_payers_rw on public.expense_payers for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

create policy expense_shares_rw on public.expense_shares for all to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

create policy expense_changes_read on public.expense_changes for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));
create policy expense_changes_insert on public.expense_changes for insert to authenticated
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

-- ---------- atomic save with optimistic money version (C1) ----------
-- p_expense: the aggregate as JSON (snake_case columns plus "payers" and "shares" arrays
-- and "change": {kind, by_seat}). p_expected_version: null for inserts.
create function public.save_expense(p_expense jsonb, p_expected_version integer) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_current integer;
begin
  select money_version into v_current from public.expenses where id = v_id for update;
  if v_current is null and p_expected_version is not null then
    raise exception 'expense not found' using errcode = 'P0002';
  end if;
  if v_current is not null and (p_expected_version is null or v_current <> p_expected_version) then
    raise exception 'money version conflict' using errcode = '40001', hint = 'conflict';
  end if;

  insert into public.expenses as x (id, trip_id, type, status, category, title, notes, occurred_at, currency, amount,
                         fx_rate, fx_source, base_amount, split_method, money_version, receipt_paths, created_by,
                         created_at, updated_at)
  select v_id, r.trip_id, coalesce(r.type, 'expense'), r.status, coalesce(r.category, 'otro'), r.title, r.notes, r.occurred_at, r.currency, r.amount,
         r.fx_rate, r.fx_source, r.base_amount, r.split_method, r.money_version, coalesce(r.receipt_paths, '{}'),
         r.created_by, coalesce(r.created_at, now()), now()
    from jsonb_populate_record(null::public.expenses, p_expense) r
  on conflict (id) do update set
    type = excluded.type, status = excluded.status, category = excluded.category, title = excluded.title,
    notes = excluded.notes, occurred_at = excluded.occurred_at, currency = excluded.currency,
    amount = excluded.amount, fx_rate = excluded.fx_rate, fx_source = excluded.fx_source,
    base_amount = excluded.base_amount, split_method = excluded.split_method,
    money_version = excluded.money_version, receipt_paths = excluded.receipt_paths, updated_at = now();

  delete from public.expense_payers where expense_id = v_id;
  delete from public.expense_shares where expense_id = v_id;
  insert into public.expense_payers (expense_id, seat_id, amount, base_amount)
    select v_id, (p ->> 'seat_id')::uuid, (p ->> 'amount')::bigint, (p ->> 'base_amount')::bigint
      from jsonb_array_elements(coalesce(p_expense -> 'payers', '[]')) p;
  insert into public.expense_shares (expense_id, seat_id, amount, base_amount)
    select v_id, (s ->> 'seat_id')::uuid, (s ->> 'amount')::bigint, (s ->> 'base_amount')::bigint
      from jsonb_array_elements(coalesce(p_expense -> 'shares', '[]')) s;

  if p_expense ? 'change' then
    insert into public.expense_changes (expense_id, by_seat, kind, money_version)
    values (v_id, (p_expense #>> '{change,by_seat}')::uuid, p_expense #>> '{change,kind}',
            (p_expense ->> 'money_version')::integer);
  end if;
end;
$$;

grant execute on function public.save_expense to authenticated;
