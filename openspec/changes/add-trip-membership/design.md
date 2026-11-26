## Context

This is a greenfield project, so the first change also establishes the DDD skeleton (see docs/ARCHITECTURE.md) and the shared kernel. Requirements are in `specs/trip-membership/*`.

## Goals / Non-Goals

**Goals:**
- A `Trip` aggregate that owns its `Seat` entities and enforces every invariant in the specs in memory, independent of the database.
- Use cases that can run with in-memory repositories (tests, `DATA_BACKEND=memory`) or Supabase.
- A Supabase schema where RLS mirrors the domain's access rules.

**Non-Goals:**
- Notifications on claims (a later change).
- Households and presence dates (1.1).
- UI for approvals beyond what Inicio needs.

## Decisions

1. **Trip is the aggregate root and Seats live inside it** (domain).
   - Seat rules involve the whole trip: one owner, one seat per principal, uniqueness.
   - Rejected alternative: a separate Seat aggregate, which would need cross-aggregate consistency for "one owner".
2. **Cross-context facts arrive as inputs** (application).
   - "Has a settlement" and "seat is used" are owned by other contexts.
   - Use cases receive them through ports (`SettlementPresence`, `SeatUsage`) and pass booleans into domain methods.
   - This keeps the domain pure and the dependency direction correct.
3. **Principals** (shared kernel): a `PrincipalId` is just the Supabase auth user id. Guests are anonymous auth users, so RLS treats them the same as accounts. The seat stores `principal_id` and `link_kind` (`guest` | `user`) only for display and upgrade.
4. **Claim race** (infrastructure + application): the domain rejects a claim on a linked seat. The repository saves the whole trip with `save_trip`, a compare-and-set on `trips.version`, and the unique index on `(trip_id, principal_id)` still backs it up. A lost race is a `conflict`; the use case reloads and retries (up to 3 times), so the loser of two simultaneous claims ends in `already_claimed` from the domain itself.
5. **Invite tokens** (domain + infrastructure):
   - A per-seat token is 128-bit random, base64url. Only its SHA-256 is stored.
   - Re-issuing replaces the hash and unlinks the seat.
   - The generic trip token works the same way at trip level.
6. **Errors** (shared kernel): use cases return `Result<T, DomainError>`. A `DomainError` has a stable `code` (`forbidden`, `validation`, `conflict`, `not_found`, `currency_locked`, …) so the presentation layer can map codes to Spanish copy.
7. **Currency table** (shared kernel): a static map with COP 0, USD 2, EUR 2, MXN 2, BRL 2, PEN 2, JPY 0, KWD 3, plus dust tolerances. The trip validates its base currency against it.

8. **Persistence: the server is the only writer** (infrastructure).
   - Repositories use the service-role key, server-only. A use case loads the aggregate, the domain decides, and the repository writes the whole aggregate in one RPC (`save_trip`, `save_expense`).
   - `save_trip` can be executed only by the service role; members cannot change links or roles through the API.
   - RLS and the column grants stay as the guard for anything the browser does with the publishable key (today only auth; later realtime).
   - Rejected alternative: writing with the user's JWT through RLS. It would need an RPC per domain operation, re-implementing every rule in SQL.
9. **Auth flows** (composition + presentation).
   - No wall: "Crear viaje" and "Entrar como Juli" sign in anonymously when there is no session, so the person becomes a guest principal on that device.
   - "Entrar" emails a 6-digit code (no passwords, no links to open in another browser).
   - "Guarda tu acceso" attaches an email to the same anonymous user, verified with a code, so every seat keeps its principal. Its seats then change from `guest` to `user`.
   - Email confirmations are on, so attaching an email always needs the code.

## Risks / Trade-offs

- [The aggregate grows as more seat features arrive] → Seat stays an entity with its own methods; split only if a real consistency boundary appears.
- [RLS and domain rules diverge] → Write SQL assertions for the RLS policies, and keep server actions authoritative (they run the domain).
- [Anonymous users pile up in Auth] → A periodic cleanup of anonymous users with no linked seat (later change).

## Migration Plan

This is the first migration (`supabase/migrations/*_trip_membership.sql`). Rollback = drop the tables, since there is no production data yet.
