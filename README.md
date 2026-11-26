# Our Share

Gastos compartidos para viajes en grupo. Mobile-first PWA (Next.js 16 + Supabase), built with Domain-Driven Design and OpenSpec.

## Docs
| | |
|---|---|
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Product: rules, flows, scope |
| [docs/ADVERSARIAL_REVIEW.md](docs/ADVERSARIAL_REVIEW.md) | Red-team findings and decisions |
| [docs/DESIGN.md](docs/DESIGN.md) | Tonal design system (tokens, components) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Bounded contexts, layers, dependency rules |
| [openspec/](openspec/) | Behavior specs and change proposals (`openspec list`, `openspec view`) |

## Run it
Demo without Docker (in-memory, seeded with the Cartagena trip):
```bash
npm install
npm run dev          # http://localhost:3000
```

With Supabase (Postgres, real sign-in; Docker running):
```bash
npx supabase start   # local stack: Studio :54323, Mailpit (emails with codes) :54324
npm run db:reset     # apply supabase/migrations
cp .env.example .env.local   # fill the keys from `npx supabase status`
npm run dev
```
Create a trip, tap "Invitar" on a person, and open the link in a private window to join as them.

Receipt reading ("Foto de la factura") goes through OpenRouter: add `OPENROUTER_API_KEY` (and optionally `OPENROUTER_RECEIPT_MODEL`) to `.env.local`. Without it, photos are attached to expenses but not read.

## Checks
```bash
npm test             # Vitest: domain + use cases (in-memory)
npm run test:db      # Vitest: Supabase repositories against the local stack
npm run db:test      # pgTAP: constraints, RLS, grants
npm run typecheck
npm run lint         # includes DDD import rules
openspec validate --all --strict
```

## Layout
```
src/shared-kernel/            Money, currency table, FxRate (BigInt), allocate(), ids, Result
src/contexts/<context>/       trip-membership · expense-ledger · settlement
  domain/                     aggregates, value objects, domain services (pure TS)
  application/                use cases + ports
  infrastructure/             adapters: in-memory and Supabase
src/composition/              composition root, cross-context adapters, auth
src/platform/supabase/        Supabase clients, generated types (`npm run db:types`)
src/proxy.ts                  refreshes the Supabase session
src/app/                      Next.js screens (Inicio, Gastos, Nuevo gasto, Cuentas, Viaje)
supabase/migrations, tests    schema, constraints, RLS, pgTAP
```

## Workflow
New behavior starts as an OpenSpec change (`/opsx:propose` in Claude Code, or `openspec new change <name>`). Then apply it, keep `tasks.md` checkboxes honest, and archive it when it's done.
