## Context

This change builds on the shared kernel and the trip-membership context from `add-trip-membership`. Requirements are in `specs/expense-ledger/*`.

## Goals / Non-Goals

**Goals:**
- An `Expense` aggregate whose money block is an immutable value object, validated and allocated in one place.
- Allocation and FX math in the shared kernel, reused by settlement.

**Non-Goals:**
- Multi-payer UI, weights and percent splits (1.1). The domain accepts several payers, but the UI sends one.
- Receipt OCR (v2).
- The offline sync queue (presentation concern; a later change).

## Decisions

1. **`MoneyBlock` value object** (domain)
   - It holds currency, amount, rate, base amount, payers, shares and split method.
   - It is built only through `MoneyBlock.create(input)`, which validates and allocates, so an invalid block can't exist.
   - The `Expense` aggregate holds `moneyVersion` and replaces the whole block on edit.
   - Rejected alternative: mutable fields on Expense, which would allow the C1 corruption.
2. **`allocate(total, weights, tieKeys)`** (shared kernel)
   - Largest remainder over integer weights.
   - The remainder goes in descending fractional order, with ties broken by an FNV-1a hash of `expenseId:seatId`.
   - Negative totals are allocated as absolute values, then negated.
   - Equal split = weights of 1. FX base allocation = weights equal to the original amounts.
3. **`FxRate`** (shared kernel)
   - Parsed from a decimal string into `{ numerator: bigint, scale: number }`.
   - `convert(amount, fromCurrency, toCurrency)` multiplies with BigInt, adjusts for the exponent difference, and rounds half-even.
   - A card charge derives the rate as `charge / amount` at 8 decimal places, stored with `source: 'card_charge'`.
   - Rejected alternative: decimal.js. It's an extra dependency for one operation, and BigInt is enough.
4. **Membership as a port** (application). `MembershipReader.getTripSnapshot(tripId)` returns the status, the active seat ids, the default-excluded ids and the roles. Use cases validate seats and permissions against it. The ledger never imports trip-membership's domain.
5. **Guards are a domain service** (`ExpenseGuards.evaluate(newExpense, recentExpenses, stats)`). It returns warnings and never errors. The application loads recent expenses within ±30 min.
6. **Persistence** (infrastructure)
   - One row per expense, plus child rows for payers and shares.
   - Writes go through a Postgres RPC `save_expense(payload, expected_version)`, so the version check and child replacement are atomic.
   - A deferred constraint trigger checks Σ shares = Σ payers = amount, in both original and base currency.

## Risks / Trade-offs

- [BigInt FX math is unfamiliar to contributors] → It's isolated in one tested module, with property-style tests for sums.
- [Defaulting the category to "Otro" lowers data quality] → Accepted: speed over completeness (F3). Category can be edited later.
- [The duplicate guard needs a query on every save] → An index on `(trip_id, occurred_at)`.

## Migration Plan

New migration `*_expense_ledger.sql` after trip membership. Rollback drops these tables.
