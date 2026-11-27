## 1. Notifications

- [x] 1.1 Domain: who hears what (`moneyChangeDeliveries` with the >10% rule and payments in someone else's name, `settlementToConfirm`, `joinRequested`, `settlingStarted`, `shareQuestion`, `changeToApprove`, `digestMessage`); verify with Vitest
- [x] 1.2 Application: `NotificationUseCases` (subscribe, unsubscribe, immediate notices, `sendDigest` for the Bogotá day), dropping subscriptions the push service reports gone; verify with Vitest
- [x] 1.3 Infrastructure: `push_subscriptions` migration (server only), Supabase and in-memory repositories, `WebPushSender` (VAPID); verify with `npm run test:db` and pgTAP
- [x] 1.4 Composition: ledger changes → notices after the response (`ledgerListeners`, `defer`), directory and digest adapters; hooks in record/confirm/start/review/join/held actions
- [x] 1.5 UI: "Avisos en este teléfono" in Viaje (states: off, on, blocked, install first on iPhone, unsupported), service worker push and click handlers, unsubscribe on sign-out
- [x] 1.6 Evening digest route `/api/cron/digest` with Vercel Cron at 01:00 UTC; verify with Vitest
- [ ] 1.7 Verify a real push on a phone (needs the VAPID keys in Vercel)
- [ ] 1.8 Email channel (needs an email provider, e.g. Resend)
