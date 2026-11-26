## Context

This change builds on `add-trip-membership` and `add-expense-ledger`. Requirements are in `specs/settlement/*`.

## Goals / Non-Goals

**Goals:**
- Pure functions for balances and plans, so they're easy to test exhaustively and reusable on the server and the client.
- A `Settlement` aggregate with an explicit state machine.

**Non-Goals:**
- Notifications delivery (WhatsApp/email/push): this change only emits domain events.
- Households and "prefer people I know" (1.1).

## Decisions

1. **`LedgerEntry` is settlement's own model of the ledger** (application port `LedgerReader`). It is `{ expenseId, sign, payers: [{seatId, base}], shares: [{seatId, base}] }`, built by an adapter from the expense-ledger repository. This is an anti-corruption layer: settlement never sees `Expense` or `MoneyBlock`.
2. **Balances are a domain service** (`computeBalances(entries, settlements)`). It returns `Map<SeatId, number>` and asserts Σ = 0 in development. Pending settlements are returned separately for display.
3. **Plans are pure domain functions** (`planSimplified`, `planHub`, `planDirect`).
   - Simplified uses a deterministic greedy algorithm: the largest absolute amount first, ties by seat id.
   - Rejected alternative: an optimal minimum-transfer solver. It's NP-hard, and greedy already guarantees ≤ n−1 transfers.
4. **Frozen plan** (domain + persistence)
   - Right after `startSettling` the application stores a `PlanSnapshot` (the transfers plus the ledger balances at freeze time); `saveIfAbsent` keeps the first one, and a trip found in Liquidando without one freezes on its next read.
   - Frozen rows shrink by the confirmed payments made on them since freezing. Deltas = `planSimplified(currentBalances + effect(remaining frozen rows))`: whatever paying the rest of the frozen plan would leave unsettled. This covers new expenses, payments that don't match a frozen row and reversals, and paying every row always leaves everyone at zero.
   - For display, deltas merge into the frozen row of the same pair (or net against the opposite one) and the row is marked "ajuste".
6. **"Revisa tu parte"** is settlement's: one `share_reviews` row per seat ("Todo bien" or a question). Questions go only to the person and the trip's admins, through the server.
5. **Settlement state machine** (domain):
   - `pending → confirmed | disputed`
   - `confirmed → reversed`
   - `disputed → pending` (re-sent)

   Auto-confirm is a method `autoConfirmIfDue(now)` invoked by a scheduled job or lazily on read.
6. **Reopened detection** (application): after a ledger change, compare the balances before and after for seats with confirmed settlements, and emit a `BalanceReopened` event.

## Risks / Trade-offs

- [Lazy auto-confirm means the state changes on read] → Persist the transition when it is observed. A cron edge function can do it eagerly later.
- [The direct plan is O(expenses × participants)] → Fine for trips (hundreds of expenses).

## Migration Plan

New migration `*_settlement.sql`. Rollback drops the table.
