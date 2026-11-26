import { createHash, randomBytes } from "node:crypto";
import type { TokenService } from "../application/ports";

/** 128-bit random tokens (base64url); only SHA-256 hashes are persisted. */
export const hashTokenService: TokenService = {
  issue() {
    const token = randomBytes(16).toString("base64url");
    return { token, hash: this.hash(token) };
  },
  hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  },
};
