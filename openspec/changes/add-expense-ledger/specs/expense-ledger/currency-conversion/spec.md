## Purpose

Defines how expenses paid in a currency other than the trip's base currency are converted, so balances stay exact and reproducible.

## ADDED Requirements

### Requirement: Frozen decimal FX rate
An expense in a foreign currency SHALL store a decimal FX rate to the base currency, captured for the expense's date at creation and frozen afterwards. The base amount SHALL be computed once as the amount × rate, rounded half-to-even to base-currency units, without floating-point arithmetic.

#### Scenario: Dinner in USD on a COP trip
- **WHEN** a 100.00 USD expense is recorded with rate 4123.7
- **THEN** its base amount is 412.370 COP

#### Scenario: Rounding half to even
- **WHEN** 0.05 USD is converted at rate 10
- **THEN** the base amount is 0 COP (0.5 rounds to the even neighbour 0)

#### Scenario: Same currency
- **WHEN** an expense is in the base currency
- **THEN** its rate is 1 and its base amount equals its amount

#### Scenario: An edit keeps the rate
- **WHEN** a 25.50 USD expense recorded at 4000 is edited to 30.00 USD after the day's rate moved to 5000
- **THEN** its base amount is 120.000 COP (still 4000)

#### Scenario: Rate looked up for the expense's day
- **WHEN** an expense in USD is recorded without a rate on 24 nov
- **THEN** the system asks the rate provider for 24 nov (or the latest published rate) and stores it with source "api"

### Requirement: Card charge override
The payer SHALL be able to enter what their card actually charged in the base currency. The system SHALL then use that as the base amount and record the rate source as card charge.

#### Scenario: Bank charged more
- **WHEN** a 100.00 EUR dinner is entered with a card charge of 486.000 COP
- **THEN** the base amount is 486.000 COP and the rate source is "card_charge"

### Requirement: Exact base-currency allocation
Each payer's and participant's base amount SHALL be allocated from the expense's base amount by largest remainder, weighted by their original-currency amounts, so that payer base amounts and share base amounts each sum exactly to the expense base amount.

#### Scenario: Three-way USD split
- **WHEN** 100.00 USD at rate 4123.7 (base 412.370 COP) is split equally among 3
- **THEN** the three base shares sum to exactly 412.370 COP

### Requirement: Rate pending for offline expenses
An expense created without a rate SHALL be marked "rate pending" and SHALL NOT count toward balances until a rate for its expense date is set.

#### Scenario: Created offline abroad
- **WHEN** a 20.00 USD taxi is recorded with no rate available
- **THEN** the expense is stored with status rate pending and is excluded from balances
