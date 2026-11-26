## 1. Shared kernel

- [x] 1.1 Add `Result`, `DomainError` with stable codes, and branded ids (`TripId`, `SeatId`, `PrincipalId`, `ExpenseId`, `SettlementId`); verify with `npx tsc --noEmit`
- [x] 1.2 Add the currency table (exponent, dust tolerance) and `Money` value object with integer guards; verify with `src/shared-kernel/money/money.test.ts`
- [x] 1.3 Add the `Clock` and `IdGenerator` ports with a system implementation and a fixed test implementation; verify with `npx tsc --noEmit`

## 2. Trip membership domain

- [x] 2.1 Implement `Trip.create` with name/date/currency validation and name de-duplication; verify with Vitest scenarios from `trips/spec.md`
- [x] 2.2 Implement the lifecycle (`startSettling`, `close` with preconditions, `reopen`) and owner/admin checks; verify with Vitest
- [x] 2.3 Implement base-currency and settle-mode changes with lock rules; verify with Vitest
- [x] 2.4 Implement Seat linking: personal-link claim, pending generic claim, approve, unlink, one seat per principal; verify with Vitest scenarios from `seats/spec.md`
- [x] 2.5 Implement roles, ownership transfer, mark left, removal of unused seats, default exclusion; verify with Vitest

## 3. Application and adapters

- [x] 3.1 Define the `TripRepository`, `SeatUsage` and `SettlementPresence` ports and add in-memory adapters; verify with use-case tests
- [x] 3.2 Implement the use cases `createTrip`, `getTrip`, `claimSeatWithPersonalLink`, `requestClaim`, `approveClaim`, `startSettling`; verify with Vitest using in-memory adapters
- [x] 3.3 Implement the Supabase `TripRepository` adapter (`save_trip` compare-and-set on `trips.version`, retry on conflict in the use cases); verify against the local stack with `npm run test:db`
- [x] 3.4 Implement `closeTrip` (preconditions read through a `CloseChecks` port: drafts from the ledger, pending payments from settlement; approvals are always 0 until R14 approvals exist) and `reopenTrip`; verify with Vitest

## 4. Database

- [x] 4.1 Write the migration for `trips` and `seats` with a unique `(trip_id, principal_id)` index, token hashes and the `is_trip_member()` helper; verify with `supabase db reset`
- [x] 4.2 Add RLS: members read their trips and seats, pending principals read nothing; verify with SQL assertions in `supabase/tests`

## 5. Presentation

- [x] 5.1 Wire `createTrip` and the trip header into the app via the composition root; verify by creating "Cartagena" in the browser
- [x] 5.2 Build the join screen for personal links (Tonal design, Spanish copy); verify by opening a seat link in a fresh browser session
- [x] 5.3 Build the generic link: QR + WhatsApp in Viaje (create, rotate), the `/u/[tripId]/[token]` picker ("Soy Leo" / "No estoy en la lista") with a waiting screen, and approve/reject in Viaje and Inicio; verify with Vitest and in the browser
- [x] 5.4 "Reenviar" a personal link for a linked seat (moves on first use, one-time links), with the recovery copy on the join screen; revoke the client-callable linking RPCs; verify with Vitest, pgTAP and in the browser

## 6. Auth

- [x] 6.1 Read the principal from the Supabase session (`src/composition/auth.ts`), refresh it in `src/proxy.ts`, and create an anonymous guest on "Crear viaje" and "Entrar como Juli"; verify by creating a trip and joining from a fresh browser session
- [x] 6.2 Sign in with a 6-digit email code, and let a guest attach an email ("Guarda tu acceso") that turns their seats into account seats; verify with the local Mailpit inbox
