## Purpose

Defines how a group trip is created and governed: its base currency, lifecycle states, settle mode and who may change them.

## ADDED Requirements

### Requirement: Create a trip with people
The system SHALL let a signed-in or guest principal create a trip with a non-empty name, a base currency from the supported currency table, optional start and end dates, and an optional list of people's names. The creator SHALL become the owner seat, and each listed name SHALL become a placeholder seat.

#### Scenario: Trip with five friends
- **WHEN** Mateo creates "Cartagena" in COP with people "Ana, Leo, Caro, Juli, Andrés"
- **THEN** the trip exists with status Activo, base currency COP and 6 seats, and Mateo's seat has role owner

#### Scenario: Empty name rejected
- **WHEN** a trip is created with the name "   "
- **THEN** creation fails with a validation error and no trip is stored

#### Scenario: Duplicate names in the list
- **WHEN** the people list is "Ana, ana , Leo"
- **THEN** seats are created for "Ana" and "Leo" only (case- and space-insensitive de-duplication)

#### Scenario: End date before start date
- **WHEN** start is 24 nov and end is 20 nov
- **THEN** creation fails with a validation error

### Requirement: Trip lifecycle
A trip SHALL move only forward through Activo → Liquidando → Cerrado, except that the owner MAY reopen a Cerrado trip back to Liquidando. Only the owner or an admin SHALL change the status.

#### Scenario: Admin starts settling
- **WHEN** an admin starts settling an Activo trip
- **THEN** the trip status becomes Liquidando

#### Scenario: Member cannot start settling
- **WHEN** a member without an admin role tries to start settling
- **THEN** the action is rejected as forbidden and the status stays Activo

#### Scenario: Close requires a clean state
- **WHEN** an admin closes a Liquidando trip that still has 1 draft expense or 1 pending settlement
- **THEN** closing is rejected and the response names what is pending

#### Scenario: Owner reopens
- **WHEN** the owner reopens a Cerrado trip
- **THEN** the status becomes Liquidando

#### Scenario: Admin cannot reopen
- **WHEN** an admin who is not the owner tries to reopen a Cerrado trip
- **THEN** the action is rejected as forbidden

### Requirement: Base currency lock
The base currency SHALL be changeable by an owner or admin until the trip's first settlement exists, and SHALL be locked afterwards.

#### Scenario: Change before any settlement
- **WHEN** an admin changes the base currency from COP to USD and no settlement exists
- **THEN** the base currency is USD

#### Scenario: Locked after a settlement
- **WHEN** a settlement exists and an admin tries to change the base currency
- **THEN** the change is rejected with a "currency locked" error

### Requirement: Settle mode
A trip SHALL have a settle mode: Simplificado (default), Vía organizador (requires a hub seat that is active) or Directo. The mode SHALL be changeable by an owner or admin until the first settlement exists, and afterwards only by the owner.

#### Scenario: Hub mode needs a hub
- **WHEN** an admin selects Vía organizador without choosing a hub seat
- **THEN** the change is rejected with a validation error

#### Scenario: Mode locked for admins after a settlement
- **WHEN** a settlement exists and an admin who is not the owner changes the mode
- **THEN** the change is rejected as forbidden
