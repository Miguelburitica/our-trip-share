## Purpose

Defines how members record, draft, edit and delete trip expenses, and the guards that catch common mistakes, while keeping a trustworthy history.

## ADDED Requirements

### Requirement: Record an expense
Any active seat holder SHALL be able to record an expense on an Activo or Liquidando trip with an amount, a currency, a category, an optional title, a date-time (default now), a payer (default the recorder) and participants (default: active seats that are not default-excluded). A Cerrado trip SHALL reject new expenses.

#### Scenario: Minimal quick add
- **WHEN** Mateo records 184.000 COP and taps Guardar without changing anything else
- **THEN** an expense exists with category "Otro", payer Mateo, all 6 active seats as participants and an equal split

#### Scenario: Closed trip
- **WHEN** someone records an expense on a Cerrado trip
- **THEN** the expense is rejected

### Requirement: Receipt drafts
A member SHALL be able to save a receipt photo with no amount as a draft. A draft SHALL NOT affect balances, SHALL be listed as pending for its creator, and SHALL become a normal expense when completed with an amount and split.

#### Scenario: Snap now, fill later
- **WHEN** Mateo snaps a receipt at 4:12 p.m. without an amount
- **THEN** a draft exists, balances are unchanged, and Mateo's pending list shows "1 recibo sin monto"

#### Scenario: Complete a draft
- **WHEN** the draft is completed with 120.000 COP split among 4
- **THEN** it becomes a complete expense and balances include it

### Requirement: Versioned money edits
The money fields of an expense (amount, currency, rate, payers, participants, split) SHALL change only as a whole, with the version the editor last saw. If the stored version differs, the edit SHALL be rejected as a conflict without changing the expense. Non-money fields (title, notes, category, date) SHALL be editable without a version check.

#### Scenario: Concurrent edits
- **WHEN** Ana and Leo both open version 3, Ana saves a new amount, and then Leo saves new shares based on version 3
- **THEN** Ana's edit is stored as version 4 and Leo's edit is rejected as a conflict

### Requirement: Payer change permission
Changing who paid SHALL be allowed only for the current payer, the new payer, or an owner/admin.

#### Scenario: Outsider changes the payer
- **WHEN** Leo, who is neither payer nor admin, changes the payer of Ana's dinner to himself
- **THEN** the edit is rejected as forbidden

#### Scenario: Payer fixes it
- **WHEN** Ana changes the payer of her own dinner to Caro
- **THEN** the edit is accepted

### Requirement: Soft delete and history
Deleting an expense SHALL mark it deleted, remove it from balances immediately, and keep it in history. Every change SHALL be recorded with its author and time.

#### Scenario: Delete a duplicate
- **WHEN** Caro deletes a duplicated "Súper Olímpica"
- **THEN** balances no longer include it and its history shows it deleted by Caro

### Requirement: Inline guards
On save, the system SHALL return non-blocking warnings:
- "personal" when the only participant is the only payer;
- "possible duplicate" when the trip has another expense with the same amount within ±30 minutes;
- "unusually large" when the base amount is at least 10× the trip's median and the trip has at least 5 expenses (lodging is never flagged).

Warnings SHALL NOT block saving.

#### Scenario: Possible duplicate
- **WHEN** Mateo records 184.000 COP at 9:42 p.m. and Ana recorded 184.000 COP at 9:40 p.m.
- **THEN** the expense is saved and the response includes a "possible duplicate" warning referencing Ana's expense

#### Scenario: Personal expense
- **WHEN** Mateo records 30.000 COP paid by Mateo with only Mateo as participant
- **THEN** the expense is saved with a "personal" warning and no balance changes
