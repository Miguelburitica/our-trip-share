export type DomainErrorCode =
  | "validation"
  | "forbidden"
  | "conflict"
  | "not_found"
  | "already_claimed"
  | "currency_locked"
  | "invalid_state";

/** A business-rule violation with a stable code the presentation layer maps to copy. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const validationError = (message: string, details?: Record<string, unknown>) =>
  new DomainError("validation", message, details);
export const forbidden = (message: string, details?: Record<string, unknown>) =>
  new DomainError("forbidden", message, details);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new DomainError("conflict", message, details);
export const notFound = (message: string, details?: Record<string, unknown>) =>
  new DomainError("not_found", message, details);
export const invalidState = (message: string, details?: Record<string, unknown>) =>
  new DomainError("invalid_state", message, details);
