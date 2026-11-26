## Why

Every other feature (expenses, balances, future photos and itinerary) needs to know *who is on the trip*. Friends must be able to appear before they ever sign up, and the least motivated friend must be able to join from a WhatsApp link with no account. This is the foundation of the product (PRODUCT_SPEC §3.1–3.2, §5, §6.1–6.2; adversarial findings F1, F12, C4, M7).

Bounded context: **trip-membership**.

## What Changes

- **Trips:** create a trip with a name, optional dates, a base currency and a list of people. The lifecycle is Activo → Liquidando → Cerrado, and the settle mode is configurable.
- **Seats:** each person is a seat. It starts as a placeholder (a name only) and is later linked to a guest (no account) or an account. Seats carry a role (owner/admin/member), a status (active/left) and a "default excluded" flag.
- **Per-seat invite links:** they link the opener to that seat immediately.
- **Generic trip link:** it creates a *pending* claim that sees nothing until the owner, an admin or the seat's creator approves it.
- **Seat rules:**
  - a principal holds at most one seat per trip;
  - a seat can be claimed only while unlinked;
  - claims can be undone;
  - seats can be removed only if unused;
  - the owner must transfer ownership before leaving.
- **Trip rules:**
  - the base currency and the settle mode lock after the first settlement;
  - only owners and admins change settings or the lifecycle.

## Capabilities

### New Capabilities
- `trip-membership/trips`: creating trips, lifecycle states, base currency and settle-mode rules, owner/admin permissions on trip settings.
- `trip-membership/seats`: placeholder/guest/account seats, roles, per-seat and generic invites, claims and approvals, removal, leaving, ownership transfer.

### Modified Capabilities
_None (first change in the project)._

## Impact

- New code under `src/contexts/trip-membership/` (domain, application, infrastructure) and `src/shared-kernel/`.
- New Supabase tables `trips` and `seats` with RLS. Guests are Supabase anonymous users.
- The expense-ledger and settlement contexts consume this through a `MembershipReader` port.
