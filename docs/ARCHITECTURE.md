# Architecture — Domain-Driven Design

## Bounded contexts

```
                 ┌──────────────────────┐
                 │   trip-membership    │  Trip (aggregate root) · Seat
                 │  "who is on the trip"│  lifecycle, roles, invites, claims
                 └─────────▲────────────┘
     MembershipReader port │            │ MembershipReader port
          ┌────────────────┘            └──────────────┐
┌─────────┴────────────┐   LedgerReader port   ┌────────┴─────────────┐
│    expense-ledger    │◀──────────────────────│      settlement      │
│  "what was spent"    │                       │  "who pays whom"     │
│ Expense (agg. root)  │                       │ Balances · Plan ·    │
│ money block, splits  │                       │ Settlement (agg.)    │
└──────────────────────┘                       └──────────────────────┘
            ╲                                       ╱
             ╲──────────── shared-kernel ──────────╱
               Money · Currency · FxRate · allocate() · Ids · Result
```

- **Upstream / downstream:** expense-ledger and settlement are downstream of trip-membership. Settlement is downstream of expense-ledger.
- **Ports:** a context never imports another context's domain. It declares the port it needs (e.g. `LedgerReader` in settlement) and the composition root wires an adapter that reads the upstream context.
- **Shared kernel:** small, stable value objects used everywhere. Changing it is a cross-team decision.

## Layers (inside each context)

```
src/contexts/<context>/
  domain/          pure TypeScript: aggregates, entities, value objects, domain events,
                   repository interfaces. No IO, no framework, no Date.now() (Clock is injected).
  application/     use cases (commands + queries) and the ports they need. Orchestrates
                   domain objects and repositories. Returns Result<T, DomainError>.
  infrastructure/  adapters: in-memory repositories (tests, local dev) and Supabase
                   repositories (production).
src/shared-kernel/ Money, Currency table, FxRate, allocation, ids, Result, errors.
src/composition/   composition root: builds use cases with the adapters chosen by env, plus auth (session → principal).
src/platform/      shared infrastructure plumbing (Supabase clients, generated DB types, error mapping).
src/app/           Next.js presentation (server components + server actions). Calls use cases only.
supabase/          migrations (schema, constraints, RLS) and local config.
openspec/          specs (source of truth for behavior) and changes (proposals, designs, tasks).
```

**Dependency rule:** presentation → application → domain. Infrastructure implements ports defined by application or domain. Domain depends on nothing but the shared kernel.

## Key decisions
1. **Money lives in our own currency table.** We store the units people actually use, so `COP` has exponent 0 (pesos), `USD` 2 and `KWD` 3. Conversion to ISO-4217 minor units happens only at external API edges.
2. **FX rates are decimal strings.** They are computed with BigInt and rounded half-even once per expense. Per-row base amounts are allocated by largest remainder, so every expense sums exactly.
3. **Balances are derived, never stored.** The settlement context recomputes from the ledger and settlements. Postgres enforces per-row constraints.
4. **Expense money is a versioned block.** Edits carry `expectedMoneyVersion`; a mismatch is a conflict, never a silent merge.
5. **Seats, not users.** All records reference `seat_id`. Claiming a seat links a principal (an anonymous guest or an account) without moving data.
6. **Guests are Supabase anonymous users.** A guest is a real auth principal with RLS like everyone else, and can be upgraded to an account later.
7. **The server is the only writer.** Repositories use the service-role key on the server and save whole aggregates through RPCs with optimistic versions (`save_trip`, `save_expense`); trip use cases retry on a conflict. RLS keeps guarding direct access with the publishable key.
8. **No sign-up wall.** Creating a trip or opening a personal link signs in anonymously; "Entrar" uses a 6-digit email code; "Guarda tu acceso" attaches an email to the same principal.
9. **Joining links.** Personal links store only a token hash and work once; re-sending one for a seat in use moves the seat when the new link is opened (new phone). The trip's generic link (QR) keeps its token in clear so it can be shown again; it only lets people *ask* for a seat, which an admin approves. Linking RPCs are not callable by clients.
10. **Private by default.** Payment details (`payout_handles`) and "Tu saldo cambió" notices are readable only by their own seat through the API; the app shows someone's payment details only to people who owe them. Receipt photos live in a private bucket behind short-lived signed URLs.
11. **Abandoned guests are cleaned up.** `cleanup_abandoned_guests()` runs daily (pg_cron) and removes anonymous users older than 7 days that never got a seat, withdrawing their pending requests first. Deleting a user never deletes a seat.
12. **In-memory adapters are first-class.** Domain and application tests run with no database. Local dev can run without Docker (`DATA_BACKEND=memory`).

## Testing
- **Domain:** Vitest unit tests, fast and exhaustive on money rules.
- **Application:** Vitest with in-memory adapters.
- **Infrastructure:** Supabase migrations are checked with `supabase db reset` plus pgTAP assertions for constraints, RLS and grants (`npm run db:test`). The Supabase repositories run the same use cases against the local stack (`npm run test:db`), including two people claiming one link at once.
