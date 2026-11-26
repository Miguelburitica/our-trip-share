## 1. Shared kernel money math

- [x] 1.1 Implement `allocate()` (largest remainder, deterministic tie-break, negative totals); verify with `src/shared-kernel/money/allocate.test.ts`, including sum invariants over random inputs
- [x] 1.2 Implement `FxRate` parse/convert (BigInt, half-even, exponent differences) and `fromCardCharge`; verify with `src/shared-kernel/money/fx-rate.test.ts` using the spec scenarios

## 2. Expense ledger domain

- [x] 2.1 Implement `MoneyBlock.create` for equal and exact splits, payer sums and base allocation; verify with Vitest scenarios from `split-rules/spec.md` and `currency-conversion/spec.md`
- [x] 2.2 Implement the `Expense` aggregate: record, draft, complete draft, versioned money edit, payer-change permission, soft delete, money received; verify with Vitest scenarios from `expense-capture/spec.md`
- [x] 2.3 Implement the `ExpenseGuards` domain service (personal, duplicate, unusually large); verify with Vitest

## 3. Application and adapters

- [x] 3.1 Define the `ExpenseRepository` and `MembershipReader` ports with in-memory adapters; verify with use-case tests
- [x] 3.2 Implement the use cases `recordExpense`, `snapReceiptDraft`, `completeDraft`, `editExpenseMoney`, `deleteExpense`, `listTripExpenses`; verify with Vitest using in-memory adapters
- [x] 3.3 Implement the Supabase `ExpenseRepository` using the `save_expense` RPC (row order, full history, FX rate read as text); verify against the local stack with `npm run test:db`

## 4. Database

- [x] 4.1 Write the migration for `expenses`, `expense_payers` and `expense_shares`, with the deferred sum-check trigger and the `save_expense` RPC; verify with `supabase db reset` and an SQL assertion that an unbalanced insert fails
- [x] 4.2 Add RLS: only linked trip members read and write expenses of their trip; verify with SQL assertions

## 5. Presentation

- [x] 5.1 Build the quick-add sheet (Tonal design, keypad, category chips, split picker, inline warnings) calling `recordExpense`, with split presets: "Igual que el último", "Todos menos…" labels and saved groups (`split_groups`, `getQuickAddDefaults`, `saveSplitGroup`, `deleteSplitGroup`); verify in the browser, with `npm test`, `npm run test:db` and pgTAP
- [x] 5.2 Build the Gastos list grouped by day showing "tu parte"; verify in the browser
- [x] 5.3 Receipt photos in quick add: private `receipts` bucket, `scanReceipt` / `receiptUrl` use cases, `ReceiptReader` port with an OpenRouter vision adapter (on when `OPENROUTER_API_KEY` is set; model `OPENROUTER_RECEIPT_MODEL`), "Ver factura" in Gastos; verify with Vitest, `npm run test:db` and in the browser (attach path; live reading not yet verified without a key)
- [x] 5.4 Build the expense detail (Pagó, Le toca a, history, "Ver factura") and "Editar reparto" (exact amounts with the rest rebalanced equally, `getExpense`, `editExpenseMoney`); verify with Vitest and in the browser
