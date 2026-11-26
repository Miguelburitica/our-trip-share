## Purpose

La vaca: the group kitty. Members put money in, it pays expenses, and what's left goes back to the people who put it in.

## ADDED Requirements

### Requirement: La vaca is a seat with a holder
A trip SHALL have at most one pot ("la vaca"), created by an owner or admin, with one holder: the member who keeps the money. The pot SHALL be listed apart from the people, SHALL never be linked to anyone, and SHALL never owe a share of an expense. It MAY pay expenses.

#### Scenario: The pot can't owe
- **WHEN** someone records an expense split between la vaca and Leo
- **THEN** it is rejected with "La vaca paga, pero no le toca parte"

#### Scenario: One per trip
- **WHEN** an admin creates a second vaca
- **THEN** it is rejected as a conflict

### Requirement: Contributions and the holder
A contribution SHALL be a settlement from a member to the pot. The holder SHALL act for the pot: a contribution recorded by a member is pending until the holder confirms it, and one recorded by the holder is confirmed at once.

#### Scenario: Juli puts money in
- **WHEN** Juli records 300.000 to la vaca, kept by Mateo
- **THEN** it is pending until Mateo confirms it

### Requirement: Leftover refunded in proportion
The pot's cash SHALL be its confirmed contributions minus what it paid and refunded. In Simplificado and Vía organizador, the plan SHALL first refund the cash to contributors in proportion to what each put in (largest remainder, counting refunds already made), as transfers from the pot that its holder makes; any remainder (an overspent pot, or someone already refunded more) is the holder's. Directo SHALL treat the pot as one more party. While Liquidando, the pot's refunds SHALL follow its current cash rather than the frozen plan.

#### Scenario: 160.000 left
- **WHEN** Juli put 300.000 and Leo 100.000, and la vaca paid a 240.000 lunch
- **THEN** the plan refunds 120.000 to Juli and 40.000 to Leo from la vaca

#### Scenario: Overspent
- **WHEN** la vaca holds 100.000 and pays 150.000
- **THEN** its cash shows −50.000 and the holder is owed the 50.000 they fronted
