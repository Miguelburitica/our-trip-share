## 1. Settlement domain

- [x] 1.1 Implement the `computeBalances` domain service with sign rules and pending separation; verify with the Cartagena scenario and a sum-zero test in `balances.test.ts`
- [x] 1.2 Implement `planSimplified`, `planHub` and `planDirect`; verify with the Cartagena scenarios in `plan.test.ts`, including determinism
- [x] 1.3 Implement the `Settlement` aggregate state machine (record, confirm, dispute, autoConfirmIfDue, reverse) with permission rules; verify with Vitest scenarios from `payments/spec.md`
- [x] 1.4 Implement dust tolerance, the overpayment warning and the pay-in-full base amount; verify with Vitest
- [x] 1.5 Implement the frozen plan with deltas; verify with the "expense added while settling" scenario
- [x] 1.6 Base deltas on current balances so off-plan payments and reversals become deltas, and merge deltas into frozen rows for display; verify with Vitest

## 2. Application and adapters

- [x] 2.1 Define the `LedgerReader` and `SettlementRepository` ports with in-memory adapters, and a ledger adapter backed by the expense repository; verify with use-case tests
- [x] 2.2 Implement the use cases `getTripBalances`, `getSettlementPlan`, `recordSettlement`, `confirmSettlement`, `disputeSettlement`; verify with Vitest
- [x] 2.3 Implement balance-reopened detection after expense money changes (ledger publishes `ExpenseMoneyChanged`, settlement records `balance_notices`), with the Inicio "Tu saldo cambió" card; verify with Vitest, `npm run test:db`, pgTAP and in the browser
- [x] 2.4 Store the frozen plan (`PlanSnapshotRepository`, `freezePlan`), report close blockers, reject payments on a Cerrado trip, and store "Revisa tu parte" answers (`share_reviews`); verify with Vitest and `npm run test:db`

## 3. Database

- [x] 3.1 Write the migration for `settlements` and `plan_snapshots` with RLS; verify with `supabase db reset` and SQL assertions
- [x] 3.2 Add `share_reviews` (own-only RLS) and make `plan_snapshots` server-written; verify with pgTAP

## 4. Presentation

- [x] 4.1 Build the Inicio balance card and the Cuentas screen (mode switch, plan, per-person balances) from the use cases; verify with the Cartagena seed in the browser
- [x] 4.2 Build the Cobrar sheet (WhatsApp cobro, "Ya me pagó", confirm or dispute a pending payment) and the Pagar sheet ("Ya pagué"); list pending payments that no longer match the plan under "Por confirmar"; verify in the browser
- [x] 4.3 Save "Cómo te pagan" per seat (`payout_handles`, own-only RLS), show the receiver's details in Pagar only to debtors (`getHandlesToPay`), and add mine to the WhatsApp cobro; verify with Vitest, `npm run test:db`, pgTAP and in the browser
- [x] 4.4 Cuentas through the lifecycle: "Empezar a liquidar", the frozen-plan banner with "ajuste" rows, questions for admins, "Cerrar viaje" with blockers and warnings, read-only Cerrado and "Reabrir"; the Inicio "Revisa tu parte" card; no "+" or edits on a Cerrado trip; verify in the browser
