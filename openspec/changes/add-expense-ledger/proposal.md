## Why

Logging an expense in seconds, with math that is boringly correct, is the core promise of the product (PRODUCT_SPEC §3.4, §4 R1–R6, R9–R13, §6.3–6.5). The adversarial review found that naive splitting, float FX rates and field-level merges corrupt balances (C1, C2, M6, m1, m9). This change defines the ledger so every later feature can trust it.

Bounded context: **expense-ledger** (it consumes trip-membership through `MembershipReader`).

## What Changes

- **Recording expenses.**
  - Every expense has: a category, an optional title, a date, and a single payer (the domain supports several).
  - The split method is equal or exact; weights and percent come in 1.1.
  - The participant list must not be empty, and the payer may be excluded.
- **"Money received" type** for refunds and returned deposits. It splits like an expense and counts with the opposite sign.
- **Money rules.**
  - Amounts are integer units from our currency table.
  - Equal splits use deterministic largest-remainder rounding.
  - Exact splits must sum to the total.
- **Foreign currency.**
  - A per-expense decimal FX rate is frozen at creation.
  - "Cuánto te cobró la tarjeta" derives the rate from the real card charge.
  - Base amounts are allocated per row, so every expense sums exactly in the base currency.
- **Drafts.** A receipt photo with no amount is a draft. Drafts don't affect balances and can be completed later.
- **Versioned money edits.** An edit carries the expected version, and a mismatch is a conflict.
- **Payer changes** are allowed only for the old payer, the new payer or an admin.
- **Soft delete.** A deleted expense leaves balances immediately and stays in history.
- **Inline guards.** "Personal" (the only participant is the payer), likely duplicate (same amount within ±30 min) and unusually large amount.

## Capabilities

### New Capabilities
- `expense-ledger/expense-capture`: recording, drafts, editing with versions, payer-change permission, soft delete, guards.
- `expense-ledger/split-rules`: equal/exact allocation, rounding, signs, currency table units.
- `expense-ledger/currency-conversion`: frozen decimal FX rates, card-charge override, exact base-currency allocation.

### Modified Capabilities
_None._

## Impact

- New `src/contexts/expense-ledger/`.
- `src/shared-kernel/money/` gains `allocate()` and `FxRate`.
- New Supabase tables `expenses`, `expense_payers`, `expense_shares` and `receipts`, with sum constraints enforced at commit.
- The settlement context reads the ledger through its `LedgerReader` port.
