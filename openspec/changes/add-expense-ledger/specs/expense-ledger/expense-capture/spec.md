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

### Requirement: Recording what someone else paid
Quick add SHALL let the recorder pick any active seat (or la vaca) as the payer from a list, and SHALL confirm who paid when the payer is not the recorder ("Guardado · pagó Leo").

#### Scenario: Passenger records the toll
- **WHEN** Juli opens quick add, taps "Pagó tú", picks Leo and saves $18.000
- **THEN** the expense has payer Leo, recorder Juli, and quick add shows "Guardado · pagó Leo"

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

### Requirement: Receipt photo in quick add
Quick add SHALL let a member attach a photo of the receipt ("Foto de la factura"). The photo SHALL be stored privately under its trip and only attached to expenses of that trip; members SHALL open it through a short-lived link. When a receipt reader is configured, the photo SHALL be read to pre-fill the amount, a title from the merchant, and the category; the member reviews and saves. A receipt in another currency than the trip's, an unreadable photo or a failing reader SHALL NOT block the expense: the photo stays attached and the member types the amount.

#### Scenario: Reading a bar receipt
- **WHEN** Mateo picks a photo of a Bar Bajo receipt whose total to pay is $96.000 including the tip
- **THEN** quick add shows $96.000, the category Tragos and "Factura · Bar Bajo", and saving records the expense with the photo attached

#### Scenario: Reader unavailable
- **WHEN** no reader is configured or it fails
- **THEN** the photo is still attached and quick add asks for the amount

#### Scenario: Photo from another trip
- **WHEN** an expense is submitted with a receipt path stored under a different trip
- **THEN** it is rejected with a validation error

### Requirement: Changes that reopen settled balances wait while Liquidando (R14)
While a trip is Liquidando, a money change (new, edited or deleted expense) by a member who is not an owner or admin, that would move the balance of someone with a confirmed payment, SHALL NOT count until an owner or admin approves it. An approval SHALL apply the change only if the expense's money version hasn't moved since; otherwise the change is dropped. The author MAY withdraw it. Changes waiting for approval SHALL block closing the trip.

#### Scenario: Juli adds a taxi with Leo, who already paid
- **WHEN** the trip is Liquidando, Leo has a confirmed payment, and Juli (member) adds a 40.000 taxi split with Leo
- **THEN** balances don't change, Mateo sees "Juli agregó Taxi · $40.000" to approve, and after he approves Leo's balance moves by −20.000

#### Scenario: The expense changed in the meantime
- **WHEN** Juli's edit is waiting and an admin edits the same expense first
- **THEN** approving Juli's edit fails and it is dropped
