## Purpose

Defines how the system suggests who should pay whom to bring every balance to zero, in the trip's chosen settle mode.

## ADDED Requirements

### Requirement: Simplified plan
In Simplificado mode the system SHALL repeatedly match the largest debtor with the largest creditor for the smaller of the two amounts, breaking ties by seat id. The result SHALL be at most n−1 transfers, SHALL bring every balance to zero, and SHALL be identical on every computation for the same balances.

#### Scenario: Cartagena simplified
- **WHEN** the balances are Mateo +1.687.000, Andrés +184.000, Ana −176.000, Caro −401.000, Juli −641.000 and Leo −653.000
- **THEN** the plan has 5 transfers:
  - Leo → Mateo 653.000
  - Juli → Mateo 641.000
  - Caro → Mateo 393.000
  - Caro → Andrés 8.000
  - Ana → Andrés 176.000

### Requirement: Hub plan
In Vía organizador mode every debtor other than the hub SHALL pay the hub its full debt, and the hub SHALL pay every creditor other than itself its full credit.

#### Scenario: Cartagena via Mateo
- **WHEN** the hub is Mateo and the balances are as above
- **THEN** the plan has 5 transfers:
  - Leo → Mateo 653.000
  - Juli → Mateo 641.000
  - Caro → Mateo 401.000
  - Ana → Mateo 176.000
  - Mateo → Andrés 184.000

### Requirement: Direct plan
In Directo mode the system SHALL compute, for each pair of seats, what each owes the other from the expenses they shared (proportionally to the amounts paid when there are several payers), net the pair, and subtract the confirmed settlements between them.

#### Scenario: Cartagena direct
- **WHEN** the Cartagena expenses are settled directly
- **THEN** the plan includes Juli → Mateo 400.000, Leo → Mateo 379.000, Caro → Mateo 348.000 and Ana → Mateo 310.000, and the transfers total 15

### Requirement: Pending settlements are excluded from the plan
Pending settlements SHALL NOT reduce the suggested transfers. The plan SHALL show a pending settlement next to the transfer it would cover.

#### Scenario: Juli paid but unconfirmed
- **WHEN** Juli has a pending 641.000 settlement to Mateo
- **THEN** the plan still contains Juli → Mateo 641.000, marked "por confirmar"

### Requirement: Frozen plan during Liquidando
When the trip enters Liquidando, the current plan SHALL be frozen. Later balance changes SHALL NOT reorder or replace the frozen transfers. The system SHALL add delta transfers computed only from the changes since freezing.

#### Scenario: Expense added while settling
- **WHEN** the plan is frozen and a 60.000 COP taxi paid by Ana is added, split between Ana and Leo
- **THEN** the frozen transfers are unchanged and a delta transfer Leo → Ana 30.000 is added

#### Scenario: Payment that matches no frozen transfer
- **WHEN** the plan is frozen and Leo pays Juli 100.000 directly, which no frozen transfer covers
- **THEN** the frozen transfers are unchanged and a delta transfer Juli → Leo 100.000 is added

#### Scenario: The mode switch is gone while frozen
- **WHEN** the trip is Liquidando or Cerrado
- **THEN** the plan shown is the frozen plan with its deltas, whatever mode is asked for

### Requirement: Revisa tu parte
While a trip is Liquidando, each member SHALL be able to answer "Todo bien" or ask a question about their share. A question SHALL be visible only to its author and the trip's owner and admins; other members SHALL see only how many people answered "Todo bien".

#### Scenario: Juli asks a question
- **WHEN** Juli asks "¿La lancha era para todos?" while the trip is Liquidando
- **THEN** Mateo (owner) sees the question in Cuentas, and Ana (member) sees none

#### Scenario: Reviewing before settling
- **WHEN** someone answers while the trip is still Activo
- **THEN** the answer is rejected

#### Scenario: Open questions warn before closing
- **WHEN** an admin closes a trip with 1 open question
- **THEN** the confirmation warns about it, and closing is still allowed

### Requirement: Read-only summary link
An owner or admin SHALL be able to create a summary link that anyone can open without signing in. It SHALL show the trip's name and dates, the total spent, what each person paid, used and their balance, la vaca's cash and the plan, and nothing else (no expense details, links or payment details). Creating it again SHALL replace the old link, and turning it off SHALL make it stop working.

#### Scenario: Shared in the group chat
- **WHEN** Mateo creates the summary link for Cartagena and someone opens it without an account
- **THEN** they see the 4.332.000 total and the 5 transfers

#### Scenario: Turned off
- **WHEN** an admin turns the link off
- **THEN** opening it shows "Este resumen ya no está disponible"
