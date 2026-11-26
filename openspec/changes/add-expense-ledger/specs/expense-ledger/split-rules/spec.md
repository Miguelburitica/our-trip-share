## Purpose

Defines how an expense amount is divided among participants so that shares are integers in the trip's currency units and always add up exactly to the total.

## ADDED Requirements

### Requirement: Integer currency units
All amounts SHALL be integers in the currency table's units (COP and JPY: 0 decimals; USD, EUR, MXN: 2; KWD: 3). Non-integer, non-finite or unsafe values SHALL be rejected.

#### Scenario: COP amount in pesos
- **WHEN** an expense of 184.000 COP is recorded
- **THEN** it is stored as the integer 184000

#### Scenario: Fractional COP rejected
- **WHEN** an amount of 184000.5 COP is submitted
- **THEN** the expense is rejected with a validation error

### Requirement: Equal split with deterministic remainder
An equal split SHALL give every participant `floor(total / n)` and distribute the remainder one unit at a time to participants chosen by a stable order derived from the expense id and seat id. The sum of shares SHALL equal the total, and recomputing the same expense SHALL give the same result.

#### Scenario: Divisible amount
- **WHEN** 540.000 COP is split equally among 6
- **THEN** every share is 90.000

#### Scenario: Remainder distributed
- **WHEN** 100.000 COP is split equally among 3
- **THEN** the shares are 33.333, 33.333 and 33.334 in some order, summing to 100.000

#### Scenario: Stable result
- **WHEN** the same expense with the same participants is split twice
- **THEN** the same seats receive the extra unit both times

### Requirement: Exact split
An exact split SHALL accept one amount per participant, each an integer ≥ 0, and SHALL be rejected unless the amounts sum exactly to the total.

#### Scenario: Exact amounts that match
- **WHEN** 300.000 COP is split exactly as 150.000 / 100.000 / 50.000
- **THEN** the expense is accepted with those shares

#### Scenario: Exact amounts that do not match
- **WHEN** 300.000 COP is split exactly as 150.000 / 100.000 / 40.000
- **THEN** the expense is rejected and the error reports 10.000 missing

### Requirement: Participants and payers
An expense SHALL have at least one participant and at least one payer. Payer amounts SHALL sum to the total. A payer MAY be excluded from the participants. Every seat SHALL belong to the trip.

#### Scenario: Payer not included
- **WHEN** Mateo pays 96.000 COP for beers split among Juli, Leo, Andrés and Ana
- **THEN** each of the four owes 24.000 and Mateo owes nothing on this expense

#### Scenario: No participants
- **WHEN** an expense is submitted with zero participants
- **THEN** it is rejected with a validation error

#### Scenario: Seat from another trip
- **WHEN** a participant seat does not belong to the trip
- **THEN** the expense is rejected

### Requirement: Money received has the opposite sign
An expense of type "money received" SHALL split its absolute amount with the same rules, and its effect on balances SHALL be the negation of an equal expense.

#### Scenario: Airbnb deposit returned
- **WHEN** Ana receives a 300.000 COP deposit refund split among 3
- **THEN** Ana's balance decreases by 300.000 for what she received, and each of the 3 participants' balances increases by 100.000

### Requirement: Quick-add split presets
Quick add SHALL preselect the participants of the last two expenses when both are complete, recorded within the last 12 hours, and share the same participants that differ from the trip default. Otherwise it SHALL preselect the trip default. The last expense's participants SHALL be offered as "Igual que el último" whenever they differ from the default. Members SHALL be able to save the current selection as a named group shared by the trip: names are unique per trip (ignoring case and spaces), up to 30 characters, with at least 2 seats of the trip, and at most 12 groups per trip. Only the group's creator or an admin SHALL delete it. Seats no longer active SHALL be dropped from a group, and a group left with fewer than 2 SHALL be hidden.

#### Scenario: Same subgroup twice
- **WHEN** Mateo and Ana split the last two expenses of the evening between the two of them
- **THEN** the next quick add preselects Mateo and Ana, labelled "Igual que el último"

#### Scenario: Saving "Carro 1"
- **WHEN** Mateo saves Ana and Leo as "Carro 1", then Juli tries to save another group named "carro 1"
- **THEN** the first is offered to everyone in the trip and the second is rejected as a duplicate

#### Scenario: Deleting someone else's group
- **WHEN** Leo, a plain member, tries to delete the "Parejas" group Ana created
- **THEN** it is rejected as forbidden

### Requirement: Adjust each person's share after the fact
The expense detail SHALL show who paid, each person's share (the viewer's highlighted), the split method and the history. Any member SHALL be able to edit the split of a complete base-currency expense: include or exclude people, type exact amounts for some, and have the rest split equally among the others. The edit SHALL be saved only when the amounts add up to the total, as an equal split when nobody's amount was typed and as exact amounts otherwise, guarded by the money version. A single-payer expense MAY change its total in the same edit.

#### Scenario: Ana only had a soup
- **WHEN** Ana edits a 184.000 dinner split among 4 and types 30.000 for herself
- **THEN** the other three are shown 51.334, 51.333 and 51.333, the expense saves as exact amounts, the history shows the change, and settled members whose share moved get a "Tu saldo cambió" notice

#### Scenario: Amounts don't add up
- **WHEN** every included person has a typed amount and they sum to less or more than the total
- **THEN** the editor shows "Faltan $X por repartir" or "Te pasaste por $X" and doesn't save

#### Scenario: Someone else edited first
- **WHEN** the expense's money version changed since the editor opened
- **THEN** saving is rejected with "Alguien editó este gasto mientras tanto"
