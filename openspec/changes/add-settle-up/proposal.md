## Why

People need to know who pays whom, with few transfers and without friction or awkwardness (PRODUCT_SPEC §4 R7–R10, R14, §6.6–6.7). The adversarial review showed four problems with v1:
- fake "I paid" entries moved everyone's balances (C5);
- foreign-currency payments left dust that never settles (M1);
- edits silently reopened settled debts (C3);
- strangers were paired to pay each other (F6).

Bounded context: **settlement** (it consumes expense-ledger through `LedgerReader` and trip-membership through `MembershipReader`).

## What Changes

- **Derived balances.** Each seat's balance is computed from complete expenses (money-received expenses with the opposite sign) and confirmed settlements. The sum is always 0.
- **Settlement plans** in three modes:
  - Simplificado: greedy, at most n−1 transfers, deterministic.
  - Vía organizador: everyone settles with the hub.
  - Directo: pairwise debts from shared expenses.
- **Frozen plan** when the trip enters Liquidando. Later changes add delta transfers only for the people they affect.
- **Settlement payments.**
  - Recorded by the payer: pending until the receiver confirms, auto-confirmed after 3 days.
  - Recorded by the receiver: confirmed immediately.
  - Disputed: "No me llegó".
  - Corrected only by reversal entries.
- **"Saldar todo"** pays the exact remaining debt. An overpayment shows a warning, and a dust tolerance per currency counts as settled.
- **"Tu saldo cambió" events** when a money change reopens a seat that already has a confirmed settlement.

## Capabilities

### New Capabilities
- `settlement/balances`: balance derivation, sign rules, the sum-zero invariant, dust tolerance, reopened-balance detection.
- `settlement/settlement-plan`: the three plan modes, determinism, the frozen plan and deltas.
- `settlement/payments`: recording, confirming, disputing, auto-confirming and reversing settlements, overpayment and pay-in-full.

### Modified Capabilities
_None._

## Impact

- New `src/contexts/settlement/`.
- New Supabase table `settlements`, with RLS.
- The Cuentas, Cobrar and Pagar screens consume these use cases.
