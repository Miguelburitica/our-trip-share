# Adversarial review of spec v1 → decisions for v2

Two independent red-team reviews ran against `PRODUCT_SPEC.md` v1:
- **Money/rules reviewer** (QA lead + fintech engineer): correctness, permissions, data integrity, edge cases. IDs `C*` (critical), `M*` (major), `m*` (minor).
- **UX/market reviewer** (lazy friend, anxious payer, 12-person organizer, LatAm strategist): flows, social dynamics, adoption, competition. IDs `F*`.

Decision legend: **Accepted** · **Modified** (accepted with a different fix) · **Deferred** (right, but later phase) · **Rejected**.

## Critical

| ID | Finding | Decision |
|---|---|---|
| F1 | Friends won't get through join: OAuth fails inside WhatsApp's in-app browser, magic links open in another browser and lose the session. | **Accepted.** Guest seats (no account, device-bound), per-seat links, in-app-browser detection. Account is an optional upgrade. |
| F2 | "Split = everyone" is wrong most of the time; the fixes (saved groups, presence) were v1.1. 12 avatars don't fit. | **Accepted.** MVP gets "Same as last", saved groups, "Everyone except…", default-excluded members, a full grid picker. |
| C1 | Offline last-write-wins per field on money corrupts expenses (amount from one device, shares from another). | **Accepted.** The money fields are one versioned block with `expected_version`. A conflict becomes a "conflict draft". MVP supports offline **add** only. |
| C2 | Per-share FX conversion rounding means the trip never nets to 0. The rate itself was a float. | **Accepted.** Decimal rate, one rounding of `base_amount`, largest-remainder split of base amounts, DB constraints per expense. |
| C3 | Edits, rate changes, restores and draft completion after a settlement silently reopen debts. | **Accepted.** "Balance reopened" event + inbox item. See M4 for the Settling rules. |
| C4 | Placeholder claim takeover: a leaked link lets anyone pick "Juli" and see everything; the merge-based undo is impossible. | **Accepted.** A claim *links* the seat (no data moves), uses compare-and-set, and generic-link claims are pending until approved. Per-seat links auto-approve. |
| C5 | Pending settlements change balances immediately (fake "I paid"); the receiver can't record; a confirmed settlement can't be corrected. | **Accepted.** Pending settlements are excluded from the plan and from "settled". Receiver-recorded = auto-confirmed. Corrections are reversal entries. Overpayment warning. |

## Major

| ID | Finding | Decision |
|---|---|---|
| F3 | 10s quick-add hides taps; the alpha keyboard covers the form; guards are modals; the metric is wrong. | **Accepted.** Open into last trip, category chips instead of a title field, `000` key, inline guards, metric = app-open→saved + "% edited within 24h". |
| F4 | Notifications spam a 12-person trip on day 1. | **Accepted.** Quiet defaults + evening digest in MVP. |
| F5 | Per-expense "Looks right" is ignored or reads as distrust; public questions cause drama. | **Accepted.** Per-expense confirm removed; silence = agreement. One "Review my share" pass when Settling starts. Questions go **privately to the payer** first, with a proposed fix, and become public after 24h unresolved. |
| F6 | Simplified debts make strangers pay each other; the plan shifts daily; nobody wants to chase friends. | **Accepted.** Plan frozen at Settling; settle modes Simplified / Via organizer (hub) / Direct; neutral app-authored reminders. "Prefer people I know" is **Deferred** to v1.1. |
| F7 | Nequi has no prefilled pay link; Bre-B is missing. | **Accepted.** Handles: Bre-B key, Nequi/Daviplata, PayPal.me, bank text. Copy buttons + "Open app" + WhatsApp *cobro* message. |
| F8 | No group kitty ("vaca"/"bote"). | **Accepted (MVP).** A Pot pseudo-member that can pay; contributions in, leftover refunded at close. |
| F9 | Couples/households want one transfer. | **Deferred to v1.1.** Real need, but MVP is already wide. Settle-up aggregation only. |
| F10 | Tabs duplicate each other; Members wastes a slot; the passive member wants "who do I pay". | **Accepted.** Tabs: Inicio · Gastos · ＋ · Cuentas · Viaje. Lists show *my share*. |
| F11 | "More" becomes a junk drawer. | **Accepted.** TripDay spine (`day/time/place` on every module entity) + module registry contract. |
| F12 | Placeholder confusion (two Juans, joke claims, duplicates). | **Accepted.** Per-seat links via WhatsApp; "Is this you?" before creating a new seat; claim notification + one-tap undo; admin merge tool. |
| F13 | iOS PWA: push only after install, separate cookie jar, ~7-day storage eviction. | **Accepted.** WhatsApp + email are the primary channels and push is a bonus. Queue flushes aggressively; receipts upload ASAP; Capacitor moves to v1.1. |
| M1 | Foreign-currency settlement leaves dust forever. | **Accepted.** "Settle in full" sets the exact base amount; per-currency dust tolerance. |
| M2 | Changing the base currency mid-trip is undefined. | **Accepted.** Free until the first settlement, locked after. |
| M3 | Card fees / real card charge / ATM cash rates. | **Accepted.** Optional "What did your card charge?" derives the rate. ATM-rate reuse is **Deferred**. |
| M4 | The Settling gate only covered *new* expenses. | **Modified.** Not admin approval for everything: that makes the organizer a bottleneck (F14). Money changes in Settling show an impact preview ("changes 3 people's transfers"). **Admin approval only when the change reopens a confirmed settlement.** Closing requires 0 drafts, 0 pending settlements, 0 pending approvals. |
| M5 | The Σnet = 0 check is circular; no concurrency control. | **Accepted.** Per-row constraints in the same transaction; balances always derived, never stored; row locks on multi-entity ops. |
| M6 | Refunds / deposits returned / negative amounts. | **Accepted.** "Money received" type, signed after splitting the absolute value, can link to the original. |
| M7 | Owner leaving, removal, left members' access, duplicates, someone paying for another. | **Accepted.** Transfer ownership first; remove only unused seats; left = read + settle; merge tool. "Covered by" is **Deferred**. |
| M8 | Everyone-can-edit abuse (non-participant moves shares or changes the payer). | **Modified.** Changing the payer needs the old payer, the new payer or an admin. Edits by non-participants are labelled in the diff and notify everyone affected. (No confirmations to reset, per F5.) |
| M9 | Privacy: receipts with card numbers, EXIF, roster leak, handle exposure, link rotation. | **Accepted** in full. |
| M10 | FX tweaks cause notification storms. | **Accepted.** Rate edits send one grouped notice. |

## Minor

| ID | Decision |
|---|---|
| F14 | Settling blocks new expenses on the admin → **Accepted**: warn, don't block. |
| F15 | Desktop bulk entry → **Deferred v1.1** (keyboard grid + paste). |
| F16 | Edit-policy variants are over-built → **Accepted**: MVP is "Everyone + full history" only. |
| m1 | Own currency table (COP is 2 decimals under ISO; we display 0) → **Accepted.** |
| m2 | Deterministic tie-break, "why pay Caro?" explainer, lock the mode after the first settlement → **Accepted.** |
| m3 | Itemized receipts / tip / tax → **Deferred v1.1–v2.** |
| m4 | Duplicate guard on sync, same amount AND time window → **Accepted.** |
| m5 | Large-number guard: min count, base currency, skip lodging → **Accepted.** |
| m6 | Phase contradictions → **Accepted**: every rule is tagged with its phase in v2. |
| m7 | Percent sums exactly 100 (2 decimals) → **Accepted** (percent itself is v1.1). |
| m8 | "Offset" settlement method with a required note → **Accepted.** |
| m9 | Offline expenses: rate pending, use the expense date → **Accepted.** |

## Rejected / kept against advice
- **Cutting the shares/weights split** (F-cut list): kept, but moved to **v1.1**. "Leo stayed 2 of 3 nights" is common on trips.
- **Cutting history restore** (F-cut list): MVP shows a read-only diff log, and restore comes in v1.1, as suggested. Kept here only to note that it is planned, not dropped.
- **Removing the Planning status:** accepted. Dates and Active cover it.

## Confirmed as fine (don't over-engineer)
Integer minor units; deterministic largest-remainder rounding; greedy simplification (≤ n−1 transfers); payer-excluded splits; warn (not block) on open questions at settle time; soft delete + immutable revisions.

## Strategic takeaway
"No install wall" is **not** a wedge: Tricount and Splid already do it. The wedge is **LatAm + WhatsApp-native**: Spanish-first, COP formatting, Bre-B/Nequi, the *vaca*, settling through the organizer, a per-person *cobro* message, a daily summary the group can post, and a shareable trip recap as an acquisition loop.
