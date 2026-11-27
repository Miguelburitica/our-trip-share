## Purpose

Quiet notifications: push only what needs someone now, and one evening digest for the rest.

## ADDED Requirements

### Requirement: Opt-in per device
A signed-in person SHALL be able to turn notices on or off for the device they're using. On iPhone the app SHALL explain that notices need the app on the home screen first. Signing out SHALL turn them off for that device.

#### Scenario: Turning them on
- **WHEN** Leo turns on "Avisos en este teléfono" and allows notifications
- **THEN** that phone receives Leo's notices until he turns them off or signs out

### Requirement: Immediate notices
The system SHALL push right away, never to the person who caused it and never to unlinked seats or la vaca:
- a payment recorded, changed or removed in someone's name by someone else;
- an edit or deletion that moves someone's share by more than 10%;
- a payment waiting for the receiver (or la vaca's holder) to confirm;
- a request to join, a question on "Revisa tu parte" and a change waiting for approval (to admins);
- the trip entering Liquidando (to everyone else).
New expenses that only add shares SHALL wait for the digest.

#### Scenario: Toll recorded for the driver
- **WHEN** Mateo records an $18.000 toll that Leo paid
- **THEN** Leo's phone shows "Mateo anotó que pagaste $18.000 · Peaje", and Mateo's doesn't

#### Scenario: Share edited
- **WHEN** Leo edits the dinner and Ana's share goes from $90.000 to $108.000
- **THEN** Ana gets "Cena: tu parte $90.000 → $108.000, editado por Leo"

### Requirement: Evening digest
Every evening at 20:00 Bogotá, each linked member of a trip with expenses recorded that day SHALL get one notice with the day's count and where they stand.

#### Scenario: A busy day
- **WHEN** 7 expenses were recorded today in Cartagena and Juli owes $230.000
- **THEN** Juli gets "Hoy en Cartagena · 7 gastos · debes $230.000"

### Requirement: Notices never break the action
Sending SHALL happen after the response, and a failure to send SHALL NOT fail or slow down the action that caused it. Subscriptions the push service reports gone SHALL be removed.

#### Scenario: Expired phone
- **WHEN** a push to Leo's old phone comes back as gone
- **THEN** that subscription is forgotten and his other devices still get notices
