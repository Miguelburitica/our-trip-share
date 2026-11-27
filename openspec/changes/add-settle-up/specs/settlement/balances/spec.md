## Purpose

Defines how each seat's balance in the trip's base currency is derived from the ledger and settlements, and when a balance counts as settled.

## ADDED Requirements

### Requirement: Derived balance per seat
A seat's balance SHALL equal what it paid minus what it owes across complete expenses, plus confirmed settlements it sent, minus confirmed settlements it received, all in base-currency units. Money-received expenses SHALL count with the opposite sign. Drafts, deleted expenses, rate-pending expenses, and pending, disputed or reversed settlements SHALL NOT count.

#### Scenario: Cartagena balances
- **WHEN** the trip has these expenses:
  - Airbnb 2.400.000 paid by Mateo, split among 6
  - Cena 540.000 paid by Ana, split among 6
  - Taxi 84.000 paid by Leo, split among Mateo, Leo, Caro and Juli
  - Súper 312.000 paid by Caro, split among 6
  - Lancha 900.000 paid by Andrés, split among 6
  - Cervezas 96.000 paid by Juli, split among Juli, Leo, Andrés and Ana
- **THEN** the balances are: Mateo +1.687.000, Andrés +184.000, Ana −176.000, Caro −401.000, Juli −641.000, Leo −653.000

#### Scenario: Pending settlement does not count
- **WHEN** Juli records "Ya pagué 641.000 to Mateo" and Mateo has not confirmed
- **THEN** Juli's balance is still −641.000 and the settlement is shown as pending

### Requirement: Balances sum to zero
The sum of all seats' balances in a trip SHALL be exactly 0 at all times.

#### Scenario: Any set of complete expenses
- **WHEN** balances are computed for any trip
- **THEN** their sum is 0

### Requirement: Dust tolerance
A balance whose absolute value is below the base currency's dust tolerance (COP 100, USD 0.05, EUR 0.05) SHALL count as settled.

#### Scenario: Leftover 40 pesos
- **WHEN** Caro's balance is −40 COP after paying in USD
- **THEN** Caro is shown as settled

### Requirement: Reopened balance detection
When a money change (an expense created, completed, edited or deleted) moves the balance of a seat that has at least one confirmed settlement, the system SHALL record a "Tu saldo cambió" notice for that seat naming the delta, the expense and who changed it. The seat that made the change SHALL NOT be notified. Only the notified seat SHALL see and dismiss its notice.

#### Scenario: Dinner edited after Juli settled
- **WHEN** Juli has a confirmed settlement and the dinner amount changes so that her share rises by 12.000
- **THEN** a notice for Juli with delta −12.000 is recorded, and Mateo, who edited it, gets none

#### Scenario: Dismissing
- **WHEN** Juli taps "Entendido" on her notice
- **THEN** it no longer shows, and nobody else can dismiss it for her

### Requirement: Payment recorded in your name
When someone records, edits or deletes an expense so that what another seat paid changes (the driver's toll recorded by a passenger), the system SHALL record a notice for that seat with what they paid before and after, the expense and who changed it, so they can check it. A seat SHALL get at most one notice per change: this one takes the place of "Tu saldo cambió" when both apply. The seat that made the change and la vaca SHALL NOT be notified.

#### Scenario: Toll recorded for the driver
- **WHEN** Juli records a $18.000 toll with Leo as payer, split among the three
- **THEN** Leo gets "Juli anotó que pagaste $18.000" linking to the expense, and Juli gets nothing

#### Scenario: Payer moved away
- **WHEN** Mateo changes the toll's payer from Leo to himself
- **THEN** Leo gets a notice that his $18.000 payment was removed
