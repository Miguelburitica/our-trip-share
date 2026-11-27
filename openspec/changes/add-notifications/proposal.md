## Why

People only open the app when something needs them: a payment to confirm, someone joining, a change to their share. Notifications must be quiet by default (PRODUCT_SPEC §6.9): what needs someone now is pushed right away, everything else waits for one evening digest. Email needs a provider account, so the MVP starts with Web Push (Android, and iPhone once the app is on the home screen), behind a port that email can join later.

Bounded context: **notifications** (it reads trip-membership through `NotificationDirectory`, the ledger and settlement through `DigestSource`; the ledger's change events reach it through the composition root).

## What Changes

- **Push subscriptions** per device (`push_subscriptions`, server only), turned on from "Avisos en este teléfono" in Viaje; dropped on sign-out and when the push service says they're gone.
- **Immediate notices:** a payment in your name recorded or changed by someone else; your share edited by more than 10%; a payment to confirm; someone asking to join (admins); a question on "Revisa tu parte" (admins); a change waiting for approval (admins); the trip entering Liquidando.
- **Evening digest** at 20:00 Bogotá (Vercel Cron, `CRON_SECRET`): "Hoy en Cartagena · 7 gastos · debes $230.000" for each trip with expenses that day.
- Sending never blocks or fails the action that caused it (`after`).

## Impact

- New context `src/contexts/notifications`, migration `push_subscriptions`, `public/sw.js` push handlers, `/api/cron/digest`, `vercel.json`.
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`. Without the keys nothing is pushed and everything else works.
