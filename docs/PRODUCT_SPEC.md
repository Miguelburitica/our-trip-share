# Our Share — Product Spec v2

> Working name **Our Share** (UI: Spanish-first, es-CO; English second).
> A shared space for a group trip. Module #1 is **Expenses** (*Gastos*). Later modules (photos, itinerary, places, polls, docs) plug into the same trip, members, day-timeline and activity feed.
>
> v2 incorporates the adversarial review. Every decision and what was rejected is in [ADVERSARIAL_REVIEW.md](ADVERSARIAL_REVIEW.md). Rules are tagged **[MVP]**, **[1.1]** or **[v2]**.

---

## 1. Problem, promise, wedge

On a group trip one person pays the Airbnb, another the dinner, a third the taxi for only four of the six. It ends up scattered across a WhatsApp thread and somebody's notes app, and at the end nobody trusts the math.

**Promise:** *log an expense in seconds, let everyone see exactly what their share is and why, and close the trip with few, painless transfers.*

**Wedge.** No-install joining is table stakes; Tricount and Splid already have it. We win on being **LatAm- and WhatsApp-native**:
- Spanish-first copy and COP formatting (`$184.000`).
- Payment handles people actually use: **Bre-B keys, Nequi, Daviplata**.
- The group kitty (**la vaca**) as a first-class concept.
- **Settle through the organizer** (everyone pays one person), the most common real pattern.
- A per-person **cobro** message, a daily summary to post in the group, and a trip recap that brings new users in.
- Built as a **trip toolbox**, not a ledger, so the next tools (photos, itinerary) reuse everything.

**Non-goals:** moving or holding money; personal budgeting; business expense reports; cross-trip debt netting.

### Success metrics
- **Primary:** median time from *app open* to *expense saved* ≤ 10s.
- **Default accuracy:** % of expenses edited within 24h (lower = better defaults).
- **Activation:** listed seats that get claimed (guest or account).
- **Outcome:** % of trips that reach *Cerrado* with balance 0.

---

## 2. Personas

| Persona | Needs |
|---|---|
| **Organizer** (creates the trip, pays the big stuff, often the settle hub) | One-minute setup, add everyone before they join, stop being the group accountant, never have to chase friends personally. |
| **Payer on the go** | Log a taxi one-handed, with bad signal, at 2am. |
| **Auditor** | See what they owe and why, check receipts, question something without drama. |
| **Passive friend** (the one who decides adoption) | Open a WhatsApp link, see "you pay Mateo $641.000", copy the Bre-B key, tap "ya pagué". No sign-up. |

---

## 3. Domain model

```
User ─┐
      └─< TripMember (seat) >── Trip ──< TripDay (spine for every module)
                                  │
                                  ├──< Expense ── money block (versioned):
                                  │       amount, currency, rate, base_amount,
                                  │       ExpensePayer[], ExpenseShare[], method
                                  │     ──< Attachment · Question · Revision
                                  ├──< Settlement (+ reversal entries)
                                  ├──< SavedGroup (split presets)
                                  ├──< ActivityEvent (shared feed, all modules)
                                  └──< ModuleInstance (expenses, photos, …)
```

### 3.1 Trip
`name`, `cover`, `start_date`, `end_date`, `base_currency`, `status` (**Activo → Liquidando → Cerrado**), `settle_mode` (*Simplificado* | *Vía organizador* | *Directo*), `hub_member_id` (for *Vía organizador*), `modules_enabled`, `pinned_module` (max 1 in the tab bar).
- **Base currency** can change freely until the first settlement, then it locks. **[MVP]**

### 3.2 Seat (TripMember)
A seat is a person in the trip; it may or may not be linked to anyone.
- `display_name`, `color`, `avatar`, `role` (`owner` | `admin` | `member`), `status` (`active` | `left`).
- `link`: `none` (placeholder) | `guest` (device-bound token, no account) | `user` (account).
- `default_excluded` (e.g. the groom; skipped by default splits). **[MVP]**
- `presence_from/to` (optional dates on the trip). **[1.1]**
- `household_id` (settle-up aggregation for couples and families). **[1.1]**
- All data references **`member_id`**, never `user_id`. Claiming a seat only sets its link; no records move.

### 3.3 The Pot (*la vaca*) **[MVP]**
A special seat of type `pot`, with one **holder** (a member who physically keeps the cash or account).
- Contributions are settlements from member → pot.
- The pot can be the **payer** of an expense.
- The pot balance is shown everywhere it is used. A warning appears when an expense would make it negative ("La vaca solo tiene $120.000").
- At *Cerrado*, leftover money is refunded to contributors in proportion to what each put in (largest-remainder rounding). Each refund is a suggested transfer from the holder.

### 3.4 Expense
- `category` (required, from chips), `title` (optional; falls back to the category name), `date_time`, `notes`, `place` (optional, **[1.1]**), `day_id` (derived from date).
- `type`: `expense` | `money_received` (refunds, deposits returned). **[MVP]**
- **Money block**, versioned as a unit (`money_version`):
  - `amount` (integer minor units) and `currency`.
  - `fx_rate` (decimal string; never a float) and `fx_source` (`api` | `card_charge` | `manual`).
  - `base_amount`.
  - `payers[]` with `amount` and `base_amount`.
  - `shares[]` with `amount` and `base_amount`.
  - `split_method`: `equal` **[MVP]** | `exact` **[MVP]** | `shares` **[1.1]** | `percent` **[1.1]** | `itemized` **[v2]**.
- `status`: `draft` | `complete` | `deleted` (soft).
- `attachments[]`: receipts, EXIF stripped.

### 3.5 Settlement
- `from`, `to`, `amount`, `currency`, `base_amount` (explicit), `method` (cash, Bre-B, Nequi, Daviplata, bank, PayPal, `offset`), `note`.
- `recorded_by`, `status`: `pending` | `confirmed` | `disputed` | `reversed`.
- Corrections are **reversal entries**, never edits.

### 3.6 TripDay (the spine for future modules) **[MVP: model only]**
One row per trip date. Every module entity can carry `day_id`, `time` and `place`. Today it groups the expense list; later it holds the itinerary, photos-of-the-day and the recap.

### 3.7 Module contract
A module declares:
1. its entities;
2. **feed cards** for the activity feed;
3. **inbox items** for "Pendientes";
4. a **tile** on the Viaje tab;
5. optional **"attach to expense"** actions (e.g. itinerary booking → expense);
6. its permissions, using the shared roles.

Expenses is the first module built against this contract. Nothing about expenses is hard-coded in the trip shell.

---

## 4. Money rules

**R1. Integer money, own currency table.** Amounts are integers in the units of our own currency table: COP 0 decimals (whole pesos; centavos aren't used in practice), USD/EUR/MXN 2, JPY 0, KWD 3. The table also keeps the ISO-4217 exponent, used only when converting at external API edges (COP is 2 under ISO). **[MVP]**

**R2. Equal split.** `share = floor(total / n)`. The leftover units go one each to participants picked deterministically (hash of expense_id + member_id). Σ shares == total. For negative amounts, split the absolute value and then apply the sign. **[MVP]**

**R3. Weighted, percent and FX allocation** use largest-remainder with the same tie-break. Percent must sum to exactly 100.00. Weight 0 = excluded. **[MVP for FX; 1.1 for weights/percent]**

**R4. Exact split** must sum to the total. A live "Faltan $X" counter shows the gap, and Save stays disabled until it reaches 0. **[MVP]**

**R5. Multi-payer** amounts must sum to the total, with the same counter. **[1.1]**

**R6. Base-currency conversion.**
- `base_amount = round_half_even(amount × fx_rate)`, computed once per expense.
- Shares' and payers' base amounts are allocated from `base_amount` by largest-remainder, weighted by their original-currency amounts.
- DB constraints: Σ shares.base = Σ payers.base = expense.base_amount, and the same in original currency.
- The rate is fetched for the **expense date** (offline expenses: marked "tasa pendiente", fetched on sync for that date) and then frozen.
- **"¿Cuánto te cobró la tarjeta?"**: entering the real charge in base currency derives the rate (`fx_source = card_charge`). **[MVP]**

**R7. Balances are always derived** from rows (never stored):
`net = Σ paid.base − Σ owed.base + Σ settlements_sent.base − Σ settlements_received.base`.
Only `complete` expenses and `confirmed` settlements count toward *settled*. Pending settlements are shown as pending. **[MVP]**

**R8. Settle modes.** **[MVP]**
- **Simplificado** (default): greedy largest debtor ↔ largest creditor, ≤ n−1 transfers, deterministic tie-break by member_id. Each suggested transfer can show "¿Por qué le pago a Caro?".
- **Vía organizador**: every debtor pays the hub and the hub pays every creditor. Familiar, and nobody pays a stranger.
- **Directo**: pairwise debts from actual shared expenses (multi-payer: proportional to amount paid).
- The mode can change until the first settlement, then it locks (unlockable by owner with a warning).
- *[1.1]* **"Prefer people I know"**: only pair members who shared at least one expense.

**R9. Frozen plan.** Entering *Liquidando* freezes the transfer plan. Later money changes don't reshuffle it; they add **delta transfers** for the affected people only. **[MVP]**

**R10. Settlement rules.** **[MVP]**
- Recorded by the payer → `pending` until the receiver confirms. Auto-confirms after 3 days, with a reminder on day 2.
- Recorded by the receiver → `confirmed` immediately.
- "No me llegó" → `disputed`: removed from balances, and both people are notified.
- Correction = a reversal entry, approved by both people or an admin.
- **"Saldar todo"** sets `base_amount` to the exact remaining debt (the rate is derived for foreign-currency payments).
- An amount larger than the debt shows an overpayment warning ("Vas a quedar con saldo a favor de $X").
- **Dust tolerance:** |net| below the currency's threshold (COP 100, USD 0.05) counts as settled.

**R11. Payer excluded / personal.** A payer may be excluded from the split. If the only participant is the only payer, the expense is flagged "personal" with an inline note (not a modal). **[MVP]**

**R12. Drafts** (receipt photo without amount) don't affect balances. They show in Pendientes, and the creator gets a nudge after 24h. **[MVP]**

**R13. Soft delete.** A deleted expense leaves balances immediately, and history keeps a tombstone. *Papelera* (restorable for 30 days) comes in **[1.1]**. A receipt photo can be hard-deleted (privacy); the revision history keeps the tombstone.

**R14. Balance reopened.** Any money change that moves the net of a member who already has a **confirmed** settlement creates a "Tu saldo cambió: +$12.000 por <cambio>" event and a Pendientes item. In *Liquidando* such a change needs **admin approval** before it counts. **[MVP]**

**R15. Integrity.** Per-row constraints are checked in the same transaction. Multi-entity operations (claim, merge, restore) use row locks. **[MVP]**

---

## 5. Permissions & trust

Default stance: **trust with transparency.** Anyone in the trip can add and edit, everything is logged, and affected people are told.

| Action | Owner | Admin | Member (account or guest) |
|---|---|---|---|
| Add expense, snap receipt | ✓ | ✓ | ✓ |
| Edit/delete any expense | ✓ | ✓ | ✓ (logged; non-participant edits labelled) |
| **Change an expense's payer** | ✓ | ✓ | only the old or new payer |
| Ask a question on an expense I'm in | ✓ | ✓ | ✓ |
| Record a settlement I sent or received | ✓ | ✓ | ✓ |
| Record a settlement between two others | ✓ | ✓ | — |
| Add/rename placeholder seats | ✓ | ✓ | ✓ |
| Approve generic-link claims, merge seats | ✓ | ✓ | creator of the seat can approve |
| Remove a seat (only if it appears in no expenses or settlements) | ✓ | ✓ | — |
| Trip settings, status, settle mode | ✓ | ✓ | — |
| Approve R14 changes during Liquidando | ✓ | ✓ | — |
| Transfer ownership, delete trip | ✓ | — | — |

- **P1. Change notices.** Any edit that changes someone's owed or paid amount notifies them with the diff ("Cena: tu parte $90.000 → $108.000, editado por Leo"). Rate-only edits send one grouped notice. **[MVP]**
- **P2. Leaving.** A member with a non-zero balance can't leave; they can be marked *Se fue* (left), which means read access and settling only. The owner must transfer ownership before leaving. **[MVP]**
- **P3. Merge seats** (duplicate "Juli" and "Juliana") is an admin tool; it is logged and reversible. **[MVP]**
- MVP ships one edit policy only: **Everyone + full history.** Stricter policies come in **[1.1]** if users ask.

---

## 6. Flows

### 6.1 Joining: no wall **[MVP]**
1. **Per-seat links.** From Viaje → Personas, the organizer taps "Invitar" on Juli's seat. This opens a WhatsApp share with a link only for her (`oursha.re/s/…`) and a message: "Juli, te agregué a *Cartagena* en Our Share. Aquí ves cuánto te toca."
2. Opening it, even inside WhatsApp's in-app browser, shows the trip cover, "Hola Juli" and her share. Tapping **"Entrar como Juli"** creates a **guest** link on that device. No account needed.
3. A guest can do everything a member can. After their first action, an optional "Guarda tu acceso" offer links Google, Apple or an email so they can use other devices or recover a lost seat.
4. **Generic link + QR** (for big groups): "¿Cuál eres?" shows first names only. Tapping a name creates a **pending claim** that sees nothing until an admin or the seat creator approves it, with one tap from a notification. "No estoy en la lista" first shows "¿Eres alguno de estos?" and only then creates a new seat (also pending).
5. If an in-app browser is detected on a flow that needs OAuth, show "Abrir en Safari/Chrome" with a copy-link fallback.
6. **Recovery:** the guest token lives on the device. If it's lost (iOS storage eviction, new phone), the organizer re-sends the per-seat link and it re-links that same seat. The old token is revoked.

### 6.2 Create a trip (≤ 30s) **[MVP]**
1. Name + cover color or photo ("Cartagena").
2. Dates (optional), base currency (default from locale).
3. **Add people:** type names separated by commas, or pick from people you've traveled with. They become placeholder seats. Optionally mark someone "no paga por defecto".
4. Optional: "¿Van a hacer vaca?" adds the Pot and picks its holder.
5. Done. You land on the trip with an invite card: "Envía a cada uno su enlace por WhatsApp".

### 6.3 Quick add: the hero flow **[MVP]**
The app opens straight into the **last active trip**. The **＋** in the tab bar opens a full-height sheet with the numeric keypad already showing.

```
┌ Nuevo gasto ─────────────── ✕ ┐
│          COP                  │
│       $ 184.000               │  ← big amount, keypad below
│ [Comida][Taxi][Súper][Trago]  │  ← category chips (no keyboard)
│ [Aloj.][Plan][+ nombre]       │
│ Pagó   (● Tú) ▾               │
│ Entre  ●●●●●● Todos (6) ▾     │  ← tap avatar = toggle
│ [Igual que el último][Carro 1]│  ← smart chips
│ 30.667 c/u        📷  Hoy ▾    │
│ ┌ 1 ┬ 2 ┬ 3 ┐                 │
│ │ 4 │ 5 │ 6 │      [Guardar]  │  ← Save in thumb zone
│ │ 7 │ 8 │ 9 │                 │
│ │000│ 0 │ ⌫ │                 │
└───────────────────────────────┘
```

- **Minimum path:** type amount → Guardar. Category defaults to "Otro" and can be fixed later.
- **Split defaults:**
  1. If the last 2+ expenses today used the same subgroup, that subgroup is preselected and labelled "Igual que el último".
  2. Otherwise everyone active, minus `default_excluded`, minus people outside presence dates **[1.1]**.
- **Split picker** (tap "Entre"): a full grid of avatars with "Todos", "Ninguno", "Todos menos…" and saved groups ("Carro 1", "Parejas"). Long-press an avatar to type their exact amount; the rest rebalance equally.
- **Inline guards** (never modals) appear under the amount:
  - "¿Seguro? Es 10× lo normal" when there are ≥ 5 expenses, compared in base currency, not for lodging.
  - "Parecido a 'Cena · Ana' hace 3 min" when the same amount is within ±30 min; also checked on sync.
  - "Solo tú: no cambia cuentas".
- After saving, a toast shows "Guardado · Comida · 6 personas · **Deshacer**" for 5s. "Guardar y otro" is available for batch entry.

### 6.4 Receipt-first **[MVP]**
Tap the camera from Inicio or inside the sheet. The photo uploads immediately when there's signal and creates a **draft** (payer = me, date = now). It shows in Pendientes ("1 recibo sin monto"). *[v2]* OCR pre-fills the amount, merchant and date, and blurs card numbers.

### 6.5 Expense detail & questions **[MVP]**
- **Header:** category icon, title, amount (original and base), date, "Agregado por Ana".
- **Pagó / Le toca a:** rows with avatars and amounts. My row is highlighted, and so is "tu parte".
- **Receipt** thumbnail (tap to zoom).
- **"Preguntarle a Ana"** opens a private thread with the payer. It offers chips that each carry a fix the payer can accept in one tap:
  - *No estuve*: proposes removing me.
  - *El monto no cuadra*: proposes a new amount.
  - *Lo pagó otra persona*.
  - *Está repetido*.

  Unresolved after 24h, the question becomes visible to the trip as a soft "Pregunta abierta" tag.
- **Historial:** a read-only diff log (restore in **[1.1]**). Non-participant edits show "Leo (no está en este gasto) cambió…".
- **No per-expense "confirm".** Silence = agreement.

### 6.6 Liquidando & Cerrado **[MVP]**
- The owner or an admin taps "Empezar a liquidar".
- What happens:
  - The plan freezes (R9).
  - Everyone gets one **"Revisa tu parte"** card: a list of the expenses they're in and their total, with "Todo bien" or "Tengo una pregunta".
  - New expenses are still allowed, with an impact preview ("Cambia las transferencias de 3 personas").
  - R14 changes need admin approval.
- **Cerrado** requires 0 drafts, 0 pending settlements and 0 pending approvals; open questions trigger a warning. The pot leftover is refunded. After that the trip is read-only (the owner can reopen it, and the totals snapshot shows any difference). Export and the recap become available.

### 6.7 Settle up **[MVP]**
- **Cuentas tab:**
  - My big number ("Debes $641.000" or "Te deben $1.687.000").
  - The plan: "Juli → Mateo $641.000".
  - The mode switcher (Simplificado / Vía organizador / Directo).
  - The vaca balance.
  - A history of settlements.
- **If I owe** — Pay sheet:
  - The amount, and "Saldar todo" (partial is allowed).
  - The receiver's handles: Bre-B key, Nequi or Daviplata number, PayPal.me. Each has **Copiar**, plus "Copiar monto" and "Abrir Nequi" (launches the app, no prefill).
  - A method picker.
  - **"Ya pagué"**.
- **If I'm owed** — Cobrar sheet:
  - **"Enviar cobro por WhatsApp"**. A prefilled message: "Hola Juli, de Cartagena te toca pasarme $641.000. Mi llave Bre-B: @mateo… Detalle: oursha.re/…".
  - "Ya me pagó" (receiver-recorded = confirmed).
- **Neutral reminders:** the *app* sends them, not a friend. Day 2 of Liquidando, then every 3 days: "Our Share: tienes 1 transferencia pendiente en Cartagena". The organizer can trigger "Recordar a todos" once a day.
- **Privacy:** payment handles are shown only to members who currently owe that person.

### 6.8 Pendientes (my inbox) **[MVP]**
Only things that need **me**:
- my drafts;
- questions on expenses I paid;
- settlements to confirm;
- "Tu saldo cambió" events (R14);
- claims to approve (admins);
- the "Revisa tu parte" card.

No "you haven't confirmed X" guilt items.

### 6.9 Notifications: quiet by default **[MVP]**
- **Channels in priority order:** WhatsApp shares (user-initiated) → email → web push (Android, or iOS once installed) → in-app.
- **Immediate:**
  - my share changed by > 10%;
  - a question on my expense;
  - a settlement waiting for me;
  - a claim to approve;
  - the trip entering Liquidando.
- **Everything else** goes into one evening **digest**: "Hoy en Cartagena: 7 gastos, vas en −$230.000".
- **Daily summary image:** a shareable card for the WhatsApp group with the day's total, top expenses and each person's net.

### 6.10 Exports & recap
- **[MVP]** Read-only summary page: an unguessable, revocable link with no receipts or handles. Also a CSV export.
- **[1.1]** Recap card at close: days, total, per-person cost, top categories, branded, shareable. This is the acquisition loop. A PDF summary comes in [1.1] too.

---

## 7. Information architecture

**Mobile bottom tabs:** **Inicio** · **Gastos** · **＋** · **Cuentas** · **Viaje**

| Tab | Content |
|---|---|
| **Inicio** | My number + primary action (Pagar / Cobrar). The Pendientes stack. Today's feed. "Snap recibo" shortcut. Trip header with a switcher. |
| **Gastos** | Grouped by **day** (TripDay). Default filter "Donde estoy"; each row shows **my share** big and the total small. Search; filters by person, category, "con pregunta", drafts. |
| **＋** | Quick-add sheet (§6.3). |
| **Cuentas** | Plan, mode, vaca, settlement history, "Empezar a liquidar". |
| **Viaje** | Personas (per-seat invites, roles, merge), trip settings, export, and **module tiles** (Gastos ✓, Fotos — próximamente, Itinerario — próximamente). One module can be pinned into the tab bar later. |

**Web / desktop** (same PWA, responsive):
- A left rail with the same tabs.
- Gastos becomes **list + detail** side by side.
- Quick add opens as a right panel with full keyboard support (Enter saves, Tab moves through the fields).
- *[1.1]* a bulk-entry grid with paste from a spreadsheet.

**Trip switcher:** tap the trip name in the header to see your trips (active first) and "Nuevo viaje".

---

## 8. Behaviors & micro-rules

- **Category chips** with local keyword suggestion when a title is typed (taxi/uber → Transporte, cena/almuerzo → Comida, d1/éxito/olímpica → Súper). ES/EN. **[MVP]**
- **Saved groups** per trip, created from the split picker ("Guardar como grupo"). **[MVP]**
- **`000` key** on the keypad for COP. **[MVP]**
- **Locale formatting** follows the device (`$184.000` in es-CO). **[MVP]**
- **Offline:** **[MVP]**
  - Add expenses and snap receipts offline. A "Sin sincronizar (2)" chip is always visible until the queue flushes.
  - The queue flushes on every foreground and connectivity event.
  - **Edits require a connection** and carry `expected_money_version`. A mismatch becomes a **conflict draft** in Pendientes that shows both versions and lets you pick one.
  - Non-money fields (title, notes, category, date) merge by server receive time.
- **Undo** for 5s on every destructive action. **[MVP]**
- **In-app browser detection** and an "Abrir en navegador" helper. **[MVP]**

---

## 9. Privacy & security **[MVP]**

- Row-level security: a member can read trip rows only if their seat is linked to them and its status is `active` or `left`. Pending claims see nothing.
- Receipts:
  - kept in a private bucket with short-lived signed URLs;
  - EXIF and GPS stripped on upload;
  - a tip on the camera sheet: "Tapa el número de tu tarjeta".
- The pre-auth "¿Cuál eres?" page shows first names only.
- **Link rotation:** rotating the generic link doesn't remove anyone who already joined, so there is a separate admin action to remove a seat's access.
- **Payment handles** are visible only to people who currently owe that person.
- **Guest tokens** are device-bound, revocable, and replaced on re-link.

---

## 10. Platform

**Mobile-first PWA, one codebase for phone and desktop web.**
- **Why it's right for us:** the join path. Adoption depends on the least motivated friend, and a link that just opens is the only acceptable path.
- **What we don't rely on:** iOS web push (it needs a home-screen install few people do) and long-lived local storage (Safari evicts it after ~7 days without use). Engagement runs through WhatsApp and email. The offline queue is short-lived by design.
- **[1.1]** A Capacitor wrapper for organizers and frequent payers: reliable push, camera, storage, and an App Store presence.
- **Stack:** Next.js + Supabase.
  - Postgres with RLS, constraints and RPCs for the money operations.
  - Auth, including anonymous sign-in for guest seats.
  - Storage for receipts.
  - Realtime for live updates.
  - A daily FX API cached per date.

---

## 11. Release scope

| Phase | Scope |
|---|---|
| **MVP** | Trips; seats (placeholder, guest, account); per-seat links; generic link with pending claims; quick add (chips, smart split defaults, saved groups, "Todos menos…", inline guards); exact split; receipt drafts; per-expense currency with frozen decimal rate and card-charge override; money received/refunds; **la vaca**; balances; three settle modes; frozen plan in Liquidando; pay/cobro sheets with Bre-B/Nequi handles and the WhatsApp cobro; settlement confirm/dispute/reversal; private questions; read-only history; Pendientes; quiet notifications + digest; daily summary image; read-only summary link + CSV; offline add; ES/EN; RLS/privacy. |
| **1.1** | Multi-payer; shares/percent splits; presence dates; households; "prefer people I know"; Papelera + revision restore; recap card; PDF; desktop bulk entry; Capacitor app; stricter edit policies if requested. |
| **v2** | Receipt OCR (with card blur); itemized split with tip/tax; **Fotos** module (album links first); **Itinerario** (items can spawn expenses); Places; Polls. |

---

## 12. Open questions
1. Is guest-seat adding of expenses a fraud risk on big public trips? (Mitigation if it becomes one: per-trip setting "Invitados solo ven".)
2. Should the hub (*Vía organizador*) be the default for trips with more than 8 people?
3. Daily summary image: generated server-side (OG image) or client-side canvas?
4. Do we charge, and for what? Likely candidates: the recap card's premium themes, or a "trip pass" for receipt OCR. Never paywall adding expenses.
