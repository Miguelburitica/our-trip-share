## Purpose

Defines how members record money they paid or received to settle debts, how payments get confirmed or disputed, and how mistakes are corrected without editing history.

## ADDED Requirements

### Requirement: Record a settlement
A seat SHALL be able to record a settlement it sent or received, with an amount, a currency and a method (cash, Bre-B, Nequi, Daviplata, bank, PayPal or offset; offset requires a note). Only an owner or admin SHALL record a settlement between two other seats. A settlement recorded by its sender SHALL be pending. A settlement recorded by its receiver SHALL be confirmed.

#### Scenario: Juli says she paid
- **WHEN** Juli records 641.000 COP via Bre-B to Mateo
- **THEN** a pending settlement exists and Mateo has a pending item "Juli dice que te pagó 641.000"

#### Scenario: Mateo records cash he received
- **WHEN** Mateo records that Leo paid him 653.000 COP in cash
- **THEN** the settlement is confirmed and Leo's balance becomes 0

#### Scenario: Member records for others
- **WHEN** Caro, a plain member, records a settlement from Leo to Ana
- **THEN** it is rejected as forbidden

### Requirement: Confirm, dispute and auto-confirm
Only the receiver SHALL confirm or dispute a pending settlement. A disputed settlement SHALL NOT count, and both parties SHALL be notified. A pending settlement SHALL auto-confirm 3 days after it was recorded.

#### Scenario: Mateo confirms
- **WHEN** Mateo confirms Juli's pending settlement
- **THEN** it is confirmed and Juli's balance becomes 0

#### Scenario: No me llegó
- **WHEN** Mateo disputes Juli's pending settlement
- **THEN** it is disputed and balances are unchanged

#### Scenario: Auto-confirm
- **WHEN** a pending settlement is 3 days old and the receiver has not acted
- **THEN** it is confirmed automatically

### Requirement: Corrections by reversal
A confirmed settlement SHALL NOT be edited. It SHALL be corrected by a reversal, which an owner or admin may do. After reversal, the original no longer counts toward balances.

#### Scenario: Wrong amount confirmed
- **WHEN** an admin reverses a confirmed 65.300 settlement that should have been 653.000
- **THEN** the original no longer counts, history keeps both, and a new settlement can be recorded

### Requirement: Pay in full and overpayment
"Saldar todo" SHALL prefill the exact remaining debt between the two seats in the current plan. A settlement larger than the sender's remaining debt SHALL be accepted with an overpayment warning that states the resulting credit.

#### Scenario: Overpaying
- **WHEN** Ana, who owes 176.000, records 200.000 to Andrés
- **THEN** it is accepted with the warning "Vas a quedar con saldo a favor de $24.000"

### Requirement: Foreign-currency settlement in full
A settlement in a currency other than the base currency SHALL store an explicit base amount. Paying in full SHALL set the base amount to the exact remaining debt.

#### Scenario: Juli pays in USD
- **WHEN** Juli pays her full 641.000 COP debt with 155.00 USD using "Saldar todo"
- **THEN** the settlement's base amount is exactly 641.000 COP and Juli's balance becomes 0

### Requirement: Payment details shown only to debtors
Each member SHALL be able to save up to 4 payment details for a trip (Bre-B key, Nequi, Daviplata, bank account, PayPal or other). They SHALL be shown in the Pagar sheet only to members who owe that person in the plan being viewed, with a copy button each, and SHALL be added to that person's WhatsApp cobro. Directly through the API, a member SHALL read only their own.

#### Scenario: Juli pays Mateo
- **WHEN** Juli owes Mateo 641.000 and opens Pagar
- **THEN** she sees Mateo's Bre-B key and Nequi number and can copy each

#### Scenario: Nobody else sees them
- **WHEN** Ana owes Mateo nothing in the current plan
- **THEN** Mateo's payment details are not sent to Ana
