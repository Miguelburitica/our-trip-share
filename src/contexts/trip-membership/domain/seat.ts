import type { PrincipalId, SeatId } from "@/shared-kernel/ids";

export type Role = "owner" | "admin" | "member";
export type SeatStatus = "active" | "left";
export type PrincipalKind = "guest" | "user";

export type SeatLink =
  | { readonly kind: "none" }
  | { readonly kind: PrincipalKind; readonly principalId: PrincipalId };

export interface PendingClaim {
  readonly principalId: PrincipalId;
  readonly principalKind: PrincipalKind;
  readonly requestedAt: Date;
}

export interface SeatProps {
  id: SeatId;
  displayName: string;
  role: Role;
  status: SeatStatus;
  link: SeatLink;
  pendingClaim: PendingClaim | null;
  defaultExcluded: boolean;
  inviteTokenHash: string | null;
  createdBy: SeatId | null;
}

/** A person's place in a trip. Lives inside the Trip aggregate. */
export class Seat {
  constructor(private props: SeatProps) {}

  get id() {
    return this.props.id;
  }
  get displayName() {
    return this.props.displayName;
  }
  get role() {
    return this.props.role;
  }
  get status() {
    return this.props.status;
  }
  get link() {
    return this.props.link;
  }
  get pendingClaim() {
    return this.props.pendingClaim;
  }
  get defaultExcluded() {
    return this.props.defaultExcluded;
  }
  get inviteTokenHash() {
    return this.props.inviteTokenHash;
  }
  get createdBy() {
    return this.props.createdBy;
  }
  get isLinked() {
    return this.props.link.kind !== "none";
  }
  /** Created by a visitor with "No estoy en la lista" and not approved yet: not part of the trip. */
  get awaitingApproval() {
    return this.props.link.kind === "none" && this.props.createdBy === null && this.props.role !== "owner" && this.props.pendingClaim !== null;
  }
  /** Counts in splits and balances: not marked as left, and not a request still waiting for approval. */
  get isActive() {
    return this.props.status === "active" && !this.awaitingApproval;
  }
  get isAdmin() {
    return this.props.role === "owner" || this.props.role === "admin";
  }
  get principalId(): PrincipalId | null {
    return this.props.link.kind === "none" ? null : this.props.link.principalId;
  }

  /** @internal mutations are only called by Trip, which enforces the invariants. */
  _update(patch: Partial<SeatProps>) {
    this.props = { ...this.props, ...patch };
  }

  toPrimitives(): SeatProps {
    return { ...this.props };
  }
}
