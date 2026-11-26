## Purpose

Defines the seats of a trip (people who may or may not have joined yet), how principals claim them through invites, and the rules for roles, removal and leaving.

## ADDED Requirements

### Requirement: Seats exist before people join
A seat SHALL be identified independently of any user, and SHALL be either unlinked (placeholder), linked to a guest principal, or linked to an account principal. All trip records SHALL reference seats, so linking a seat SHALL NOT move or rewrite any record.

#### Scenario: Placeholder used before joining
- **WHEN** Andrés's seat is unlinked and Mateo records an expense that includes Andrés
- **THEN** the expense is accepted and stays attached to Andrés's seat after Andrés joins

### Requirement: One seat per principal per trip
A principal SHALL be linked to at most one seat in a trip, and a seat SHALL be linked to at most one principal.

#### Scenario: Second claim by the same person
- **WHEN** Juli, already linked to her seat, tries to claim Caro's seat in the same trip
- **THEN** the claim is rejected

#### Scenario: Race on the same seat
- **WHEN** two principals claim the same unlinked seat at the same time
- **THEN** exactly one claim succeeds and the other is rejected as already claimed

### Requirement: Per-seat invite link
Each seat SHALL have a personal invite token that the owner or any admin can share. Opening it SHALL link the opener's principal to that seat immediately, as a guest if they have no account. Re-issuing the token SHALL revoke the previous token and the previous link of that seat.

#### Scenario: Juli opens her link
- **WHEN** an anonymous visitor opens Juli's valid personal link and confirms "Entrar como Juli"
- **THEN** the visitor becomes a guest principal linked to Juli's seat with access to the trip

#### Scenario: Revoked token
- **WHEN** someone opens a personal link whose token has been re-issued
- **THEN** access is denied and no seat changes

### Requirement: Generic link creates pending claims
An owner or admin SHALL be able to create the trip's generic link, shown as a QR and shareable by WhatsApp, and rotate it (the old link stops working; people already in are unaffected). Opening it SHALL show only first names of unlinked seats. Choosing a seat SHALL create a pending claim, and the pending principal SHALL see no trip data until the owner, an admin or the seat's creator approves it. "No estoy en la lista" SHALL create a new pending seat.

#### Scenario: Claim awaits approval
- **WHEN** a visitor picks "Leo" from the generic link
- **THEN** a pending claim exists, the visitor sees a waiting screen, and no balances or expenses are visible to them

#### Scenario: Approval links the seat
- **WHEN** an admin approves the pending claim on Leo's seat
- **THEN** the principal is linked to Leo's seat

#### Scenario: Plain member cannot approve
- **WHEN** a member who did not create Leo's seat tries to approve the claim
- **THEN** the approval is rejected as forbidden

### Requirement: Undo a claim
The owner or an admin SHALL be able to unlink a seat. Unlinking SHALL leave every record attached to the seat and SHALL revoke the principal's access.

#### Scenario: Wrong person claimed a seat
- **WHEN** an admin unlinks Leo's seat that a prankster claimed
- **THEN** Leo's seat is unlinked, its expenses remain, and the prankster loses access

### Requirement: Roles
Exactly one seat per trip SHALL be the owner. The owner SHALL be able to make a seat admin or member. Ownership SHALL be transferable only by the owner to another active, linked seat.

#### Scenario: Transfer ownership
- **WHEN** the owner transfers ownership to Ana's linked seat
- **THEN** Ana is owner and the previous owner becomes admin

#### Scenario: Owner cannot leave without transferring
- **WHEN** the owner marks their own seat as left
- **THEN** the action is rejected until ownership is transferred

### Requirement: Removing and leaving seats
A seat SHALL be removable by the owner or an admin only when it appears in no expense and no settlement. Any seat SHALL be markable as left. A left seat keeps its history and balance, is excluded from default splits, and keeps read and settle access.

#### Scenario: Remove an unused seat
- **WHEN** an admin removes "Sofi", who is in no expense or settlement
- **THEN** the seat no longer exists

#### Scenario: Cannot remove a used seat
- **WHEN** an admin tries to remove Caro, who is part of an expense
- **THEN** removal is rejected and Caro can only be marked as left

### Requirement: Default exclusion
A seat SHALL carry a "default excluded" flag that removes it from default splits without affecting explicit selection.

#### Scenario: Groom excluded by default
- **WHEN** Andrés is marked default excluded
- **THEN** new expenses default to the other active seats, and Andrés can still be selected manually

### Requirement: Personal link preview
Opening a personal link SHALL show, without a session, the trip name, the seat's name and who organizes the trip, and nothing else. It SHALL tell the visitor when the seat is already theirs, already taken, or when they already hold another seat in the trip.

#### Scenario: Juli opens her link before joining
- **WHEN** someone without a session opens Juli's valid link
- **THEN** they see "Hola Juli" and an "Entrar como Juli" button, and no balances or expenses

#### Scenario: Link already used on another phone
- **WHEN** a different principal opens Juli's link after Juli joined
- **THEN** they see that the seat is taken and are told to ask the organizer for a new link

### Requirement: Guest saves access
A guest SHALL be able to attach an email to their principal after proving they own it with a code. Their seats SHALL keep the same principal and change from `guest` to `user`.

#### Scenario: Juli saves her access
- **WHEN** guest Juli enters her email and the 6-digit code sent to it
- **THEN** she can sign in with that email on another device and sees Cartagena with the same seat

#### Scenario: Email already has an account
- **WHEN** a guest enters an email that already belongs to an account
- **THEN** nothing is linked and they are told to sign in with that email instead

### Requirement: Re-send a personal link (new phone)
An owner or admin SHALL be able to re-send a personal link for a seat someone already uses. Until the new link is opened, the current phone SHALL keep access. Opening it SHALL move the seat to the opener and revoke the previous principal's access. Each personal link SHALL work once, and re-sending SHALL invalidate the previous link.

#### Scenario: Juli changed phones
- **WHEN** Mateo re-sends Juli's link and Juli opens it on her new phone
- **THEN** her seat (with all its expenses and payments) moves to the new phone and the old one loses access

#### Scenario: Old link forwarded
- **WHEN** someone opens Juli's original link after she used it
- **THEN** it shows that the seat is already in use and changes nothing

### Requirement: Only the server links seats
Members SHALL NOT be able to create trips, claim, invite or approve seats by calling the database directly; these go through the application, which enforces the rules above.

#### Scenario: Direct RPC call
- **WHEN** an authenticated member calls `claim_seat_with_invite` with the publishable key
- **THEN** it is rejected with a permission error
